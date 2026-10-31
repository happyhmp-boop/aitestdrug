/* api/drug.js : 약 이름으로 식약처 '의약품개요정보(e약은요)'를 조회해 쉬운 설명을 돌려주는 서버 함수.
   - 공공데이터포털 인증키는 Vercel 환경변수 DATA_GO_KR_KEY 에만 둔다(이 파일에 적지 않는다).
   - 사용 예(주소창에서 시험): /api/drug?name=타이레놀
   - 이 서비스는 일반의약품 중심이라 처방약은 없을 수 있다. 못 찾으면 found:false 로 알려 준다. */

const BASE = "https://apis.data.go.kr/1471000/DrbEasyDrugInfoService/getDrbEasyDrugList";

function clean(s) {
  return String(s == null ? "" : s)
    .replace(/<[^>]*>/g, " ").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&")
    .replace(/\s+/g, " ").trim();
}
function fail(res, status, error, detail) { res.status(status).json(detail ? { error: error, detail: detail } : { error: error }); }

module.exports = async function handler(req, res) {
  if (req.method !== "GET") return fail(res, 405, "method_not_allowed");
  const raw = process.env.DATA_GO_KR_KEY;
  if (!raw) return fail(res, 500, "not_configured");

  /* 인증키가 이미 변환된 형태(%가 들어 있음)이면 원래대로 풀고, 아니면 그대로 쓴다 */
  let key = raw.trim();
  try { if (/%[0-9A-Fa-f]{2}/.test(key)) key = decodeURIComponent(key); } catch (e) {}

  const name = String((req.query && req.query.name) || "").trim().slice(0, 40);
  if (!name) return fail(res, 400, "name_required");

  const url = BASE + "?ServiceKey=" + encodeURIComponent(key) + "&itemName=" + encodeURIComponent(name) +
              "&type=json&pageNo=1&numOfRows=5";
  try {
    const r = await fetch(url);
    const text = await r.text();
    let j;
    try { j = JSON.parse(text); } catch (e) {
      /* 키 오류 등은 JSON이 아니라 XML 문장으로 오는 경우가 있다. 키는 포함되지 않는 짧은 문구만 알려 준다. */
      const m = text.match(/<returnAuthMsg>([^<]*)<|<errMsg>([^<]*)</);
      return fail(res, 502, "upstream_error", (m && (m[1] || m[2])) || text.slice(0, 80));
    }
    const body = j.body || {};
    let items = body.items || [];
    if (!Array.isArray(items)) items = items.item || [];
    if (!Array.isArray(items)) items = [items];
    items = items.filter(Boolean);
    if (!items.length) return res.status(200).json({ found: false, name: name });

    /* 이름이 가장 비슷한 제품을 고른다 */
    const pick = items.find(function (x) { return String(x.itemName || "").indexOf(name) === 0; }) || items[0];
    return res.status(200).json({
      found: true, name: name,
      itemName: clean(pick.itemName), entpName: clean(pick.entpName),
      efcy: clean(pick.efcyQesitm), atpnWarn: clean(pick.atpnWarnQesitm), atpn: clean(pick.atpnQesitm),
      intrc: clean(pick.intrcQesitm), se: clean(pick.seQesitm), updateDe: clean(pick.updateDe),
      source: "식품의약품안전처 의약품개요정보(e약은요)"
    });
  } catch (e) {
    return fail(res, 502, "upstream_error");
  }
};
