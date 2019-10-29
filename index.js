const axios = require('axios')
const config = require('./config.json')
const Chainx = require('chainx.js').default;
const delay = require('delay')
const https = require('https')

const request = axios.create({
    httpsAgent: new https.Agent({
        rejectUnauthorized: false
    })
});

async function main() {
    // get info
    const validatorsInfo = await request.get(`https://api.chainx.org/intention/${config.publicKey}`)
    const total_nomination = validatorsInfo.data.totalNomination
    console.log({ total_nomination })
    let page_size = 1000
    let page = 0
    let total = page_size
    let nominators = []
    while (page_size * page < total) {
        const res = await request.get(`https://api.chainx.org/intention/${config.publicKey}/nominations?page=${page}&page_size=${page_size}`)
        //console.log(res.data)
        total = res.data.total
        page += 1
        nominators = nominators.concat(res.data.items)
    }
    // console.log(nominators)

    const chainx = new Chainx(config.wsUrl);

    // 等待异步的初始化
    await chainx.isRpcReady();

    const node_address = chainx.account.encodeAddress(config.publicKey)

    const pcx_balance = await getPcxBalance(chainx, node_address)

    console.log({ balance: pcx_balance / 1e8 })

    // transfer
    for (let i = 0; i < nominators.length; i++) {
        let item = nominators[i]
        if (item.nomination >= config.rewardThreshold) {
            const nomination = item.nomination
            const address = chainx.account.encodeAddress(item.nominator)
            if (address != node_address) {
                const reward = Math.floor(nomination / total_nomination * pcx_balance * config.rate - config.fee)
                const extrinsic = chainx.asset.transfer(address, 'PCX', reward, '自动脚本分红');
                // console.log({ nomination, address, reward })
                try {
                    const tx_hash = await fn_sign_and_send(extrinsic)
                    console.log({ i, nomination, address, reward: reward / 1e8, tx_hash })
                    await delay(5000)
                } catch (err) {
                    console.error({ i, nomination, address, reward, err })
                }
            }
        }
    }

    const vote_claim = chainx.stake.voteClaim(node_address)
    try {
        const tx_hash = await fn_sign_and_send(vote_claim)
        console.log({ tx_type: '提息', tx_hash })
        await delay(5000)
    } catch (err) {
        console.error(err)
    }

    const my_balance = await getPcxBalance(chainx, node_address)
    console.log({ my_balance: my_balance / 1e8 })

    const collect = chainx.asset.transfer(config.collectAddress, 'PCX', my_balance - 0.01, '归集')
    try {
        const tx_hash = await fn_sign_and_send(collect)
        console.log({ tx_type: '归集', tx_hash })
        await delay(5000)
    } catch (err) {
        console.error(err)
    }

}

async function getPcxBalance(chainx, address) {
    // 查询某个账户的资产情况
    const node_assets = await chainx.asset.getAssetsByAccount(address, 0, 100);

    let pcx_balance
    node_assets.data.forEach(item => {
        if (item.name == 'PCX') {
            pcx_balance = item.details.Free
        }
    })
    return pcx_balance
}

function fn_sign_and_send(extrinsic/* , acceleration */) {
    return new Promise((resolve, reject) => {
        extrinsic.signAndSend(config.privateKey, { acceleration: config.acceleration /* + acceleration */ }, (err, result) => {
            if (err) {
                reject(err.message)
            } else {
                resolve(result.txHash)
            }
        })
    })
}

main().then(() => {
    process.exit(0)
}).catch(err => {
    console.error(err)
})
