/* api/permit.js : 식약처 '의약품 제품 허가정보' 조회 시험용 서버 함수.
   - 목적: 처방약(전문의약품)도 이름으로 찾아지는지, 어떤 항목이 오는지 눈으로 확인한다.
   - 키는 Vercel 환경변수 DATA_GO_KR_KEY 에만 둔다(이 파일에 적지 않는다).
   - 사용 예(주소창): /api/permit?name=노바스크
                      /api/permit?name=노바스크&kind=detail
                      /api/permit?name=노바스크&op=getXxxx   (오퍼레이션 이름을 직접 지정해 시험)
   - 응답에는 찾은 개수, 첫 3건, 항목 이름 목록(keys)을 돌려준다. */

const BASE = "https://apis.data.go.kr/1471000/DrugPrdtPrmsnInfoService08";
const OPS = { list: "getDrugPrdtPrmsnInq08", detail: "getDrugPrdtPrmsnDtlInq08" };

function fail(res, status, error, detail) { res.status(status).json(detail ? { error: error, detail: detail } : { error: error }); }

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return fail(res, 405, "method_not_allowed");
  const raw = process.env.DATA_GO_KR_KEY;
  if (!raw) return fail(res, 500, "not_configured");

  let key = raw.trim();
  try { if (/%[0-9A-Fa-f]{2}/.test(key)) key = decodeURIComponent(key); } catch (e) {}

  const q = req.query || {};
  const name = String(q.name || "").trim().slice(0, 40);
  if (!name) return fail(res, 400, "name_required");

  let op = OPS[String(q.kind || "list") === "detail" ? "detail" : "list"];
  if (q.op && /^get[A-Za-z0-9]{3,60}$/.test(String(q.op))) op = String(q.op);

  const url = BASE + "/" + op + "?serviceKey=" + encodeURIComponent(key) + "&item_name=" + encodeURIComponent(name) +
              "&type=json&pageNo=1&numOfRows=3";
  try {
    const r = await fetch(url);
    const text = await r.text();
    let j;
    try { j = JSON.parse(text); } catch (e) {
      const m = text.match(/<returnAuthMsg>([^<]*)<|<errMsg>([^<]*)<|<resultMsg>([^<]*)</);
      return fail(res, 502, "upstream_error", { op: op, status: r.status, msg: (m && (m[1] || m[2] || m[3])) || text.slice(0, 120) });
    }
    const body = j.body || {};
    let items = body.items || [];
    if (!Array.isArray(items)) items = items.item || [];
    if (!Array.isArray(items)) items = [items];
    items = items.filter(Boolean);
    return res.status(200).json({
      op: op, name: name,
      resultMsg: (j.header && j.header.resultMsg) || null,
      totalCount: body.totalCount != null ? body.totalCount : null,
      keys: items[0] ? Object.keys(items[0]) : [],
      items: items.slice(0, 3)
    });
  } catch (e) {
    return fail(res, 502, "upstream_error");
  }
};
