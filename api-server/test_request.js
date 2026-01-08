const { z } = require('zod');

const foodRequest = () => {
  const FoodItemSchema = z.object({
    food_name: z.string(),
    quantity: z.number(),
    quantity_unit: z.string(),
    calories_per_unit: z.number()
  });

  const MealSchema = z.object({
    occasion: z.string(),
    food_items: z.array(FoodItemSchema)
  });

  const MealsSchema = z.array(MealSchema);
  const schema = z.toJSONSchema(MealsSchema);

  const requestBody = {
    data: "breakfast 2 bananas, 1 milk bread, peanut butter; dinner 1 medium paradise biriyani chicken",
    prompt:
      "Add calorie values to these food items. If an entry refers to multiple food items, break it down into different items.",
    schema: schema,
  };
  return requestBody;
};

const fileCategoryRequest = () => {
  const FileCategorySchema = z.enum([
    "TypeScript File",
    "Documentation", 
    "Test",
    "Directory",
    "Infra file",
    "Others"
  ]);

  const FileInfoSchema = z.object({
    filename: z.string(),
    category: FileCategorySchema
  });

  const FilesSchema = z.array(FileInfoSchema);
  const schema = z.toJSONSchema(FilesSchema);

  const requestBody = {
    data: require("fs").readdirSync("."),
    prompt: "For each file, identify its category",
    schema: schema,
  };
  return requestBody;
};

async function makeRequest() {
  const response = await fetch("http://localhost:3030/query_now", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer chammanthi-kl23`,
    },
    body: JSON.stringify(foodRequest()),
  });

  if (response.ok) {
    const data = await response.text();
    const jsonData = JSON.parse(data);
    console.log(JSON.stringify(jsonData.result, null, 2));
  } else {
    console.error(response);
  }
}

makeRequest();
