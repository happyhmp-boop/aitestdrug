/* api/read.js : 약봉투 사진을 받아 AI(Claude)에게 읽게 하고, 약 이름·복용량 등을 JSON으로 돌려주는 서버 함수.
   - AI 키는 Vercel 환경변수 ANTHROPIC_API_KEY 에만 둔다(이 파일에 적지 않는다).
   - 읽는 지시문(PROMPT)도 서버에 둬서, 아무나 다른 질문을 보내 쓰지 못하게 한다.
   - 개인정보 보호: 사진은 저장하지 않고 AI에 한 번 보내고 버린다. */
const PROMPT = [
 "첨부된 사진은 한국 약국의 약봉투 또는 복약안내문입니다(연습용 가상 견본).",
 "사진에 실제로 보이는 글자만 읽고 추측하지 마세요. 아래 JSON 하나로만 답하고 다른 설명은 쓰지 마세요.",
 '{"doc_type":"약봉투" | "기타",',
 ' "meds":[{"name":"약 이름(용량 제외)","strength":"용량(예 10mg) 없으면 null","dose":"1회 복용량(예 1정)",',
 '   "times_per_day":하루 복용 횟수 숫자,"timing":"복용 시점(예 아침·저녁, 매 식후)","when_note":"식전/식후 등(예 식후 30분) 없으면 null",',
 '   "days":일수 숫자,"source_text":"사진에 적힌 해당 줄 원문"}],',
 ' "confidence":0에서 1 사이 숫자(읽은 값에 대한 스스로의 확신),',
 ' "retake":글씨가 흐리거나 잘리거나 어두워 믿을 수 없으면 true 아니면 false,',
 ' "reason":"한 줄 설명"}',
 "약봉투가 아니면 doc_type은 기타, retake는 true, meds는 빈 배열로 하세요.",
 "환자 이름, 약국 이름 등 개인정보는 출력하지 마세요. 약의 효능이나 복용 조언은 쓰지 말고 사진에 적힌 것만 옮기세요."
].join("\n");

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-5-5";
const MAX_B64 = 3500000;            /* 사진 크기 상한(약 2.6MB) */
const OK_TYPES = ["image/jpeg", "image/png", "image/webp"];

function fail(res, status, error) { res.status(status).json({ error: error }); }

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "method_not_allowed");
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return fail(res, 500, "not_configured");

  /* 다른 사이트에서 몰래 호출하는 것을 막는다(같은 주소에서 온 요청만 허용) */
  const origin = req.headers.origin;
  if (origin && req.headers.host && new URL(origin).host !== req.headers.host) return fail(res, 403, "forbidden");

  const body = req.body || {};
  const data = body.image, type = body.mediaType || "image/jpeg";
  if (typeof data !== "string" || !data || data.length > MAX_B64 || OK_TYPES.indexOf(type) < 0) return fail(res, 400, "image_rejected");

  try {
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODEL, max_tokens: 1200,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: type, data: data } },
          { type: "text", text: PROMPT }
        ] }]
      })
    });
    if (r.status === 429) return fail(res, 429, "rate_limited");
    if (!r.ok) return fail(res, 502, "upstream_error");
    const out = await r.json();
    const text = (out.content || []).map(function (c) { return c.text || ""; }).join("");
    const i = text.indexOf("{"), j = text.lastIndexOf("}");
    if (i < 0 || j < i) return fail(res, 502, "invalid_json");
    let parsed;
    try { parsed = JSON.parse(text.slice(i, j + 1)); } catch (e) { return fail(res, 502, "invalid_json"); }
    if (!parsed || !Array.isArray(parsed.meds)) parsed.meds = [];
    return res.status(200).json(parsed);
  } catch (e) {
    return fail(res, 502, "upstream_error");
  }
};
