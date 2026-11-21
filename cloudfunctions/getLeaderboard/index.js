// 全站榜前 50，按 score 降序。myOpenid 取云端上下文，前端不用靠本地登录态猜「哪条是我」。
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

exports.main = async (event = {}) => {
  try {
    const { OPENID } = cloud.getWXContext()
    const res = await db.collection('grammar_scores')
      .orderBy('score', 'desc')
      .limit(50)
      .get()
    return {
      success: true,
      data: (res && res.data) || [],
      myOpenid: OPENID || ''
    }
  } catch (err) {
    console.error('获取排行榜失败', err)
    return {
      success: false,
      error: String((err && (err.errMsg || err.message)) || err)
    }
  }
}
