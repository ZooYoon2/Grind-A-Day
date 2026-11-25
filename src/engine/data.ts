import type { Dataset, Format, Question } from './types';

const base = import.meta.env.BASE_URL;

async function j<T>(name: string): Promise<T> {
  const res = await fetch(`${base}data/${name}`);
  if (!res.ok) throw new Error(`${name} 로드 실패 (${res.status})`);
  return res.json();
}

export async function loadDataset(): Promise<Dataset> {
  const [items, questions, questionItems, explanations, policies, collections, collectionItems, meta] = await Promise.all([
    j<Dataset['items']>('items.json'),
    j<Dataset['questions']>('questions.json'),
    j<Dataset['questionItems']>('question_items.json'),
    j<Dataset['explanations']>('explanations.json'),
    j<Dataset['policies']>('study_policies.json'),
    j<Dataset['collections']>('collections.json'),
    j<Dataset['collectionItems']>('collection_items.json'),
    j<Dataset['meta']>('meta.json'),
  ]);
  return { items, questions, questionItems, explanations, policies, collections, collectionItems, meta };
}

/** 조회용 인덱스 */
export class Index {
  item = new Map<number, Dataset['items'][number]>();
  question = new Map<number, Question>();
  byItemFormat = new Map<string, Question>();
  explanation = new Map<number, Dataset['explanations'][number][]>();
  dayOf = new Map<number, number>();

  constructor(public ds: Dataset) {
    for (const i of ds.items) this.item.set(i.id, i);
    for (const q of ds.questions) this.question.set(q.id, q);
    for (const qi of ds.questionItems) {
      const q = this.question.get(qi.question_id);
      if (q) this.byItemFormat.set(`${qi.item_id}:${q.format}`, q);
    }
    for (const e of ds.explanations) {
      const arr = this.explanation.get(e.question_id) ?? [];
      arr.push(e); this.explanation.set(e.question_id, arr);
    }
    for (const ci of ds.collectionItems) this.dayOf.set(ci.item_id, ci.collection_id);
  }

  q(itemId: number, format: Format): Question | undefined {
    return this.byItemFormat.get(`${itemId}:${format}`);
  }
}
