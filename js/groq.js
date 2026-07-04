import { GROQ_API_KEY, GROQ_MODEL } from "./config.js";

async function askGroq(systemPrompt, userPrompt) {
  if (!GROQ_API_KEY || GROQ_API_KEY.startsWith("YOUR_")) {
    return null; // not configured — callers fall back to a local summary
  }
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${GROQ_API_KEY}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        max_tokens: 220,
        temperature: 0.6
      })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || null;
  } catch (e) {
    console.error("Groq request failed", e);
    return null;
  }
}

// Builds a short natural-language insight from raw sales/expense numbers.
export async function generateInsight({ businessName, todaySales, weekSales, lastWeekSales, topProduct, lowStock }) {
  const system = "You are a concise business analyst assistant embedded in a small-business dashboard called SMOLBIZ. Reply with 2-3 short sentences, plain language, no markdown, no preamble.";
  const change = lastWeekSales > 0 ? (((weekSales - lastWeekSales) / lastWeekSales) * 100).toFixed(0) : null;
  const user = `Business: ${businessName}. Today's sales: $${todaySales.toFixed(2)}. This week's sales: $${weekSales.toFixed(2)}. Last week: $${lastWeekSales.toFixed(2)}. Top product: ${topProduct || "n/a"}. Low stock items: ${lowStock || 0}. Write a short insight summary mentioning the week-over-week trend and one actionable suggestion.`;

  const aiText = await askGroq(system, user);
  if (aiText) return aiText;

  // local fallback if no Groq key configured yet
  let trend = change === null ? "not enough history yet to compare weeks." :
    change >= 0 ? `sales are up ${change}% versus last week.` : `sales are down ${Math.abs(change)}% versus last week.`;
  return `Today's sales are ${"$" + todaySales.toFixed(2)}, and ${trend}${topProduct ? ` Your top seller is ${topProduct}.` : ""}${lowStock ? ` ${lowStock} product${lowStock > 1 ? "s are" : " is"} running low on stock.` : ""}`;
}

// Very small linear forecast used to feed the predictive chart + narrate it.
export function forecastNextPeriod(dailyTotals) {
  const n = dailyTotals.length;
  if (n < 2) return { points: dailyTotals, projected: dailyTotals };
  const xs = dailyTotals.map((_, i) => i);
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = dailyTotals.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - meanX) * (dailyTotals[i] - meanY); den += (xs[i] - meanX) ** 2; }
  const slope = den === 0 ? 0 : num / den;
  const intercept = meanY - slope * meanX;
  const projected = [];
  for (let i = n; i < n + 7; i++) projected.push(Math.max(0, intercept + slope * i));
  return { slope, projected };
}
