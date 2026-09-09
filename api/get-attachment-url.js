/**
 * 获取附件的临时下载链接
 * 前端传来 file_tokens 数组、record_id、field_id，返回对应的临时下载链接
 * 临时链接有效期内可以直接下载，文件从飞书服务器直接传输，不经过我们的后端
 *
 * 注意：多维表格附件需要完整的 extra 参数鉴权，格式为：
 * {
 *   "bitablePerm": {
 *     "tableId": "tblxxx",
 *     "attachments": {
 *       "字段ID": {
 *         "记录ID": ["file_token"]
 *       }
 *     }
 *   }
 * }
 * attachments 为必填参数，不填可能导致接口调用失败或返回空数据
 */

const { callFeishuApi, getCurrentUser, FEISHU_TABLE_ID } = require('./_utils');

// 附件字段ID（想法记录表中的"附件"字段）
const ATTACHMENT_FIELD_ID = 'fld7LCCG4u';

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

    // 从请求体中获取参数
    let fileTokens = [];
    let recordId = '';
    let fieldId = ATTACHMENT_FIELD_ID;

    if (req.method === 'POST') {
      // POST 请求：从 body 读取
      if (req.body && req.body.file_tokens) {
        fileTokens = req.body.file_tokens;
      }
      if (req.body && req.body.record_id) {
        recordId = req.body.record_id;
      }
      if (req.body && req.body.field_id) {
        fieldId = req.body.field_id;
      }
    } else if (req.method === 'GET') {
      // GET 请求：从 query 读取（单个 token）
      if (req.query && req.query.file_token) {
        fileTokens = [req.query.file_token];
      }
      if (req.query && req.query.record_id) {
        recordId = req.query.record_id;
      }
      if (req.query && req.query.field_id) {
        fieldId = req.query.field_id;
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

    if (!recordId) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.status(400).json({
        success: false,
        error: '缺少 record_id 参数（构建 extra 参数需要）',
      });
      return;
    }

    // 构建完整的 extra 参数（多维表格附件鉴权必需）
    // 格式：{"bitablePerm":{"tableId":"...","attachments":{"字段ID":{"记录ID":["file_token"]}}}}
    const attachmentsObj = {};
    attachmentsObj[fieldId] = {};
    attachmentsObj[fieldId][recordId] = fileTokens;

    const extraObj = {
      bitablePerm: {
        tableId: FEISHU_TABLE_ID,
        attachments: attachmentsObj,
      },
    };
    const extraBase64 = Buffer.from(JSON.stringify(extraObj)).toString('base64');

    // 调用飞书 API 批量获取临时下载链接
    // 注意：此接口是 GET 请求，数组参数用重复参数名的形式传递（file_tokens=token1&file_tokens=token2）
    const queryParams = fileTokens.map(token => `file_tokens=${encodeURIComponent(token)}`).join('&');
    const path = `/drive/v1/medias/batch_get_tmp_download_url?${queryParams}&extra=${encodeURIComponent(extraBase64)}`;
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
