const abi = require("./abi.json");

const CONTRACT_TOKEN = [
    ['0x7458ac85593472ba501ee361449638ed180a7ee7', '0x4300000000000000000000000000000000000003'],
    ['0xd58826d2c0babf1a60d8b508160b52e9c19aff07', '0x4300000000000000000000000000000000000003'],
    ['0xb4e96a45699b4cfc08bb6dd71eb1276bfe4e26e7', '0x4300000000000000000000000000000000000003'],
    ['0xf56dab7b7b2954aa86a591f164205e6cdd33797e', '0x4300000000000000000000000000000000000003'],

    ['0x18e22f3f9a9652ee3a667d78911bac55bc2249af', '0x4300000000000000000000000000000000000004'],
    ['0x4caec64454893c7912e6beb1e19b4714dd353748', '0x4300000000000000000000000000000000000004'],
    ['0x4f3da57dbfb2b85c96e3556c5f1859ef88f5d6b1', '0x4300000000000000000000000000000000000004'],
    ['0xc9434fbee4ec9e0bad7d067b35d2329e5f1d8915', '0x4300000000000000000000000000000000000004'],

    ['0x9c3d4e6f96d2c3ddd8afee3891b955283a920889', '0xf7bc58b8d8f97adc129cfc4c9f45ce3c0e1d2692'],
    ['0x83eaed4393328f77d0e402018a369b8b82e501a4', '0xf7bc58b8d8f97adc129cfc4c9f45ce3c0e1d2692']
]

async function tvl(api) {
    const tokens = [];
    const balances = [];
    let totalVolumeLocked;

    for (const [contractAddress, tokenAddress] of CONTRACT_TOKEN) {
        try {
            totalVolumeLocked = await api.call({abi: abi.vault, target: contractAddress, params: []})
        } catch (e) {
            console.error(`Error fetching totalSupply for contract ${contractAddress}:`, e);
            totalVolumeLocked = 0
        }
        balances.push(totalVolumeLocked)
        tokens.push(tokenAddress)
    }
    api.addTokens(tokens, balances)
}

module.exports = {
    methodology: 'this is a small description that will explain to DefiLlama users how the adapter works out your protocol\'s TVL',
    start: 1000235,
    blast: {tvl},
};
