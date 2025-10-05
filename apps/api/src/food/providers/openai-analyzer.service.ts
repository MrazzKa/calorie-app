import { Injectable } from '@nestjs/common';

export type AnalyzeResultItem = {
  label: string;
  gramsMean?: number | null;
  kcal?: number | null;
  protein?: number | null;
  fat?: number | null;
  carbs?: number | null;
  source?: string;
  canonicalId?: string | null;
};

type AnalyzeArgs = { buffer: Buffer; mime?: string };

@Injectable()
export class OpenAiAnalyzer {
  private key = process.env.OPENAI_API_KEY || '';
  private model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  private api = process.env.OPENAI_API_BASE || 'https://api.openai.com/v1';

  private sys =
    'You are a nutrition assistant. Return ONLY a compact JSON array of items with fields: label (string), gramsMean (number), kcal, protein, fat, carbs (numbers). No prose.';

  async analyze({ buffer, mime }: AnalyzeArgs): Promise<AnalyzeResultItem[]> {
    if (!this.key) throw new Error('OPENAI_API_KEY missing');

    const b64 = buffer.toString('base64');
    const content = [
      { type: 'text', text: 'Analyze this meal. Return JSON array as described.' },
      { type: 'input_image', image_url: { url: `data:${mime ?? 'image/jpeg'};base64,${b64}` } },
    ];

    const r = await fetch(`${this.api}/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.key}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: this.sys },
          { role: 'user', content },
        ],
        temperature: 0.2,
        max_tokens: 500,
      }),
    });

    if (!r.ok) {
      const t = await r.text().catch(() => '');
      throw new Error(`OpenAI ${r.status}: ${t.slice(0, 200)}`);
    }
    const data = (await r.json()) as any;
    const txt: string = data.choices?.[0]?.message?.content ?? '[]';
    const json = txt.trim().replace(/^```json\s*/i, '').replace(/```$/i, '');
    const arr = JSON.parse(json);
    if (!Array.isArray(arr)) throw new Error('OpenAI returned non-array');

    const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : undefined);

    return arr.map((it: any) => ({
      label: String(it.label ?? it.name ?? 'food').slice(0, 64),
      gramsMean: num(it.gramsMean ?? it.grams),
      kcal: num(it.kcal),
      protein: num(it.protein),
      fat: num(it.fat),
      carbs: num(it.carbs),
      source: 'openai',
    }));
  }
}
