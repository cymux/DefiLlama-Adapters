const http = require('./http')
const sdk = require('@defillama/sdk')
const { fixTezosBalances, } = require('./portedTokens')
const { default: BigNumber } = require('bignumber.js')
const { PromisePool } = require('@supercharge/promise-pool')
const { log } = require('../helper/utils')

const RPC_ENDPOINT = 'https://api.tzkt.io'

const usdtAddressTezos = 'KT1XnTn74bUtxHfDtBmm2bGZAQfhPbvKWR8o'

const tokenBlacklist = [
  'KT18quSVkqhbJS38d5sbRAEkXd5GoNqmAoro',
  'KT1TtaMcoSx5cZrvaVBWsFoeZ1L15cxo5AEy',
  'KT19oivKN2qzeWgCs886BbttSVYtkcJHRtuQ',
  'KT1AhSVv4Se1j3Hf5Y6a56vBV44zNzjP91D2',
  'KT1Gf5JGXC1M8GMji58pKraXiRLkzW2NRK1s',
  'KT1R52Gk7LzWvyV41oP9dRUbboHs4yVTXAZT',
  'KT1LVnyY5cSCVpFMGXzqVsWNiSkJYA8w1rZk',
  'KT1T9kFJD5fKAT4LAZWjYBCaWNbD7cw1CUju',
  'KT1JXxK3bd39ayLiiBdKm2cdReYnVSG3bkzK',
  'KT1FR9ij18K3dDExgFMBs7ppxfdGYzHiPo7c',
  'KT1GhX6MzTHKcjkMTg1mwCPzam12HRjsp6Sf',
  'KT1C9X9s5rpVJGxwVuHEVBLYEdAQ1Qw8QDjH'
]

async function getTokenBalances(account, includeTezosBalance = true) {
  const response = await http.get(`${RPC_ENDPOINT}/v1/tokens/balances?account=${account}&sort.desc=balance&offset=0&limit=40&select=balance,token.id%20as%20id,token.contract%20as%20contract,token.tokenId%20as%20token_id`)
  const balances = response.reduce((agg, item) => {
    let token = item.contract.address
    if (item.token_id !== '0') token += '-' + item.token_id

    if (!tokenBlacklist.includes(token))
      agg[token] = item.balance
    return agg
  }, {})

  if (includeTezosBalance)
    balances['tezos'] = await getTezosBalance(account)

  if (balances.tezos === 0) delete balances.tezos
  return balances
}

async function getTezosBalance(account) {
  const balance = await http.get(`${RPC_ENDPOINT}/v1/accounts/${account}/balance`)
  return +balance / 10 ** 6
}

async function getStorage(account) {
  return http.get(`${RPC_ENDPOINT}/v1/contracts/${account}/storage`)
}

async function getBigMapById(id, limit = 1000, offset = 0, key, value) {
  const response = await http.get(
    `${RPC_ENDPOINT}/v1/bigmaps/${id}/keys?limit=${limit}&offset=${offset}` + (key ? `&key=${key}` : '') + (value ? `&value=${value}` : '')
  );
  let map_entry;
  const mapping = {};
  for (map_entry of response) {
    mapping[map_entry.key] = map_entry.value;
  }
  return mapping;
}

async function addDexPosition({ balances = {}, account, transformAddress }) {
  if (!transformAddress) transformAddress = t => 'tezos:' + t
  const tokenBalances = await getTokenBalances(account)
  Object.keys(tokenBalances).forEach(token => sdk.util.sumSingleBalance(balances, transformAddress(token), tokenBalances[token]))
  return balances
}

async function resolveLPPosition({ balances = {}, owner, lpToken, transformAddress, ignoreList = [] }) {
  if (!transformAddress) transformAddress = t => 'tezos:' + t
  const LPBalances = await getTokenBalances(owner)
  if (!LPBalances[lpToken]) return balances
  const data = await getStorage(lpToken)
  const admin = data.admin || data.exchangeAddress
  const total_supply = data.total_supply || data.totalSupply

  if (ignoreList.includes(admin))
    return balances

  const tokenBalances = await getTokenBalances(admin)
  const ownershipRatio = BigNumber(LPBalances[lpToken]).dividedBy(total_supply)
  Object.keys(tokenBalances).forEach(token => {
    const balance = BigNumber(tokenBalances[token]).multipliedBy(ownershipRatio).toFixed(0)
    sdk.util.sumSingleBalance(balances, transformAddress(token), balance)
  })
  return balances
}

async function sumTokens({ owners = [], balances = {}, includeTezos = false }) {
  const { errors } = await PromisePool.withConcurrency(10)
    .for(owners)
    .process(async item => {
      const balance = await getTokenBalances(item, includeTezos)
      Object.entries(balance).forEach(([token, bal]) => sdk.util.sumSingleBalance(balances, token, bal))
    })

  if (errors && errors.length)
    throw errors[0]

  return balances
}


async function sumTokens2({ owners = [], balances = {}, includeTezos = false }) {
  await sumTokens({ owners, balances, includeTezos })
  return convertBalances(balances)
}

function fetchPrice() {
  return http.get('https://api.teztools.io/token/prices')
}


let pricePromise

async function getPrices() {
  if (!pricePromise) pricePromise = fetchPrice()
  const { contracts: pricesArray } = await pricePromise
  const priceObj = {}
  pricesArray.forEach(p => {
    let label = p.tokenAddress
    if (p.hasOwnProperty('tokenId') && p.tokenId !== 0) label += '-' + p.tokenId
    priceObj[label] = p
  })
  return priceObj
}

async function convertBalances(balances) {
  const prices = await getPrices()
  balances = fixTezosBalances(balances)
  Object.entries(balances).forEach(([key, balance]) => {
    const token = key.replace('tezos:', '')
    if (!prices[token])
      return;
    delete balances[key]

    const { decimals, usdValue, } = prices[token]
    if (!usdValue || !decimals) return;
    const bal = BigNumber(+balance * usdValue / 10 ** decimals).toFixed(0)
    const inMillions = bal / 1e6
    if (inMillions > 0.2) log(inMillions, decimals, balance, usdValue, token)
    sdk.util.sumSingleBalance(balances, 'tether', bal)
  })

  return balances
}

async function getLPs(dex) {
  if (!pricePromise) pricePromise = fetchPrice()
  const { contracts } = await pricePromise
  const LPs = {}
  for (const { pairs } of contracts)
    pairs.filter(p => p.dex === dex).forEach(p => LPs[p.address] = p)
  return Object.keys(LPs)
}

module.exports = {
  RPC_ENDPOINT,
  usdtAddressTezos,
  sumTokens2,
  getStorage,
  sumTokens,
  convertBalances,
  getTokenBalances,
  addDexPosition,
  resolveLPPosition,
  getLPs,
  getBigMapById,
}
