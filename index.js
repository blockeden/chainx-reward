const axios = require('axios')
const config = require('./config.json')
const Chainx = require('chainx.js').default;
const delay = require('delay')

async function mainLogic() {
    // get info
    const validatorsInfo = await axios.get(`https://api.chainx.org.cn/intention/${config.publicKey}`)
    const total_nomination = validatorsInfo.data.totalNomination
    console.log({ total_nomination })
    let page_size = 1000
    let page = 0
    let total = page_size
    let nominators = []
    while (page_size * page < total) {
        const res = await axios.get(`https://api.chainx.org.cn/intention/${config.publicKey}/nominations?page=${page}&page_size=${page_size}`)
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

    // 查询某个账户的资产情况
    const node_assets = await chainx.asset.getAssetsByAccount(node_address, 0, 100);

    let pcx_balance
    node_assets.data.forEach(item => {
        if (item.name == 'PCX') {
            pcx_balance = item.details.Free
        }
    })

    console.log({ pcx_balance })

    // transfer
    for (let i = 0; i < nominators.length; i++) {
        let item = nominators[i]
        if (item.nomination >= config.rewardThreshold) {
            const nomination = item.nomination
            const address = chainx.account.encodeAddress(item.nominator)
            if (address != node_address) {
                const reward = Math.floor(nomination / total_nomination * pcx_balance)
                const extrinsic = chainx.asset.transfer(address, 'PCX', reward, '自动脚本分红');
                // console.log({ nomination, address, reward })
                try {
                    const tx_hash = await fn_sign_and_send(extrinsic, i)
                    console.log({ nomination, address, reward, tx_hash })
                    await delay(2000)
                } catch (err) {
                    console.error({ nomination, address, reward, err })
                }

            }
        }
    }

}

function fn_sign_and_send(extrinsic, acceleration) {
    return new Promise((resolve, reject) => {
        extrinsic.signAndSend(config.privateKey, { acceleration: config.acceleration + acceleration }, (err, result) => {
            if (err) {
                reject(err.message)
            } else {
                resolve(result.txHash)
            }
        })
    })
}

mainLogic().then(() => {
    process.exit(0)
}).catch(err => {
    console.error(err)
})
