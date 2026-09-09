/**
 * 获取附件的临时下载链接
 * 前端传来 file_tokens 数组，返回对应的临时下载链接
 * 临时链接有效期内可以直接下载，文件从飞书服务器直接传输，不经过我们的后端
 */

const { callFeishuApi, getCurrentUser } = require('./_utils');

module.exports = async (req, res) => {
  try {
    // 登录验证：未登录返回 401
    const user = getCurrentUser(req);
    if (!user) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(401).json({
        success: false,
        error: '未登录，请先登录',
      });
      return;
    }

    // 从请求体中获取 file_tokens
    let fileTokens = [];

    if (req.method === 'POST') {
      // POST 请求：从 body 读取
      if (req.body && req.body.file_tokens) {
        fileTokens = req.body.file_tokens;
      }
    } else if (req.method === 'GET') {
      // GET 请求：从 query 读取（单个 token）
      if (req.query && req.query.file_token) {
        fileTokens = [req.query.file_token];
      }
    }

    if (!fileTokens || fileTokens.length === 0) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(400).json({
        success: false,
        error: '缺少 file_tokens 参数',
      });
      return;
    }

    // 调用飞书 API 批量获取临时下载链接
    // 注意：此接口是 GET 请求，参数通过 query string 传递（逗号分隔的 file_tokens）
    const fileTokensParam = fileTokens.join(',');
    const path = `/drive/v1/medias/batch_get_tmp_download_url?file_tokens=${encodeURIComponent(fileTokensParam)}`;
    const data = await callFeishuApi(path, {
      method: 'GET',
    });

    // 格式化返回结果
    const tmpUrls = (data.data && data.data.tmp_download_urls) || [];

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');

    res.status(200).json({
      success: true,
      data: tmpUrls,
    });
  } catch (error) {
    console.error('获取附件下载链接失败:', error);

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};
