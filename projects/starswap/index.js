const { getUniTVL, getTokenPrices, } = require('../helper/unknownTokens')
const { getFixBalances } = require('../helper/portedTokens')
const sdk = require('@defillama/sdk')

const FACTORIES = "0x0b657e81a0C3E903cbe1228579fBd49AC5D81Ac1"

const NATIVE_TOKEN_WASTAR = "0xAeaaf0e2c81Af264101B9129C00F4440cCF0F720"

const TOKENS = {
  STAR: "0x8489f4554790F5A103F2B0398537eAEe68B73884"
}

const STAKING_CONTRACT = "0x0262592d5f489e19afe070abc88a0808afc75250"
const ASTAR_LP = '0x4a0e3b2a0c35737d1c2a78fb76470ce31836024c'
const chain = 'astar'

module.exports = {
  misrepresentedTokens: true,
  methodology: "StarSwap TVL Calculation",
  astar: {
    tvl: getUniTVL({
      factory: FACTORIES,
      chain,
      useDefaultCoreAssets: true,
    }),
    staking:  async (_, _b, { [chain]: block }) => {
      const { output: { totalStakedTokens } } = await sdk.api.abi.call({
        target: STAKING_CONTRACT,
        params: 0,
        abi: {
          "type": "function",
          "stateMutability": "view",
          "outputs": [
            {
              "type": "address",
              "name": "lpToken",
              "internalType": "contract IERC20"
            },
            {
              "type": "uint256",
              "name": "allocPoint",
              "internalType": "uint256"
            },
            {
              "type": "uint256",
              "name": "lastRewardBlock",
              "internalType": "uint256"
            },
            {
              "type": "uint256",
              "name": "accStarPerShare",
              "internalType": "uint256"
            },
            {
              "type": "uint16",
              "name": "depositFeeBP",
              "internalType": "uint16"
            },
            {
              "type": "uint256",
              "name": "harvestInterval",
              "internalType": "uint256"
            },
            {
              "type": "uint256",
              "name": "totalStakedTokens",
              "internalType": "uint256"
            }
          ],
          "name": "poolInfo",
          "inputs": [
            {
              "type": "uint256",
              "name": "",
              "internalType": "uint256"
            }
          ]
        },
        chain, block,
      })

      const balances = { [chain + ':' + TOKENS.STAR] : totalStakedTokens }
      const transform = await getFixBalances(chain)
      const { updateBalances } = await getTokenPrices({ chain, block, 
        useDefaultCoreAssets: true, lps: [ ASTAR_LP ], allLps: true })
      await updateBalances(balances)
      transform(balances)
      return balances
    }
  }
}
