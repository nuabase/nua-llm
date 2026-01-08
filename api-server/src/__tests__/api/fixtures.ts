import { z } from 'zod';

// Zod schemas (source of truth)
export const profileSummaryZod = z.object({
  summary: z.string()
});

export const foodCalorieZod = z.object({
  name: z.string().describe('The name of the food item.'),
  calories: z.number().min(0).describe('The number of calories in the food item.'),
  proteins: z.number().min(0).describe('The amount of protein in grams.'),
  carbs: z.number().min(0).describe('The amount of carbohydrates in grams.')
});

export const capitalInfoZod = z.object({
  capital: z.string().describe('The capital city of the state.')
});

// JSON schemas (generated from Zod)
export const profileSummarySchema = z.toJSONSchema(profileSummaryZod);
export const foodCalorieSchema = z.toJSONSchema(foodCalorieZod);
export const capitalInfoSchema = z.toJSONSchema(capitalInfoZod);

// Test data
export const singlePerson = { name: 'John Doe', age: 30 };

export const twoPeople = [
  { id: 1, name: 'John Doe', age: 30 },
  { id: 2, name: 'Jane Doe', age: 25 }
];

export const foodItems = [
  { id: 1, name: 'Pizza' },
  { id: 2, name: 'Burger' },
  { id: 3, name: 'Pasta' },
  { id: 4, name: 'Biriyani' }
];

export const stateCapitals = [
  { id: 1, state: 'California' },
  { id: 2, state: 'Texas' },
  { id: 3, state: 'New York' },
  { id: 4, state: 'Bavaria' }
];

// Request builders
export const castValueRequest = (
  data: unknown,
  prompt: string,
  outputName: string,
  schema: Record<string, unknown>
) => ({
  input: { prompt, data },
  output: { name: outputName, schema }
});

export const castArrayRequest = (
  data: unknown[],
  prompt: string,
  outputName: string,
  schema: Record<string, unknown>,
  options?: { invalidateCache?: boolean }
) => ({
  input: { prompt, data },
  output: { name: outputName, schema },
  ...(options && { options })
});
