import Nuabase from "./nuabase-client";
import * as z from "zod";

const nua = new Nuabase({
  apiKey: process.env["NUABASE_API_KEY"], // This is the default and can be omitted
});

const FoodItemSchema = z.object({
  food_name: z.string(),
  quantity: z.number(),
  quantity_unit: z.string(),
  calories_per_unit: z.number(),
});

const OutputSchema = z.array(FoodItemSchema);

const response = await nua.zod.queryNow({
  data: [{ food_name: "rice", quantity: "100gm" }],
  prompt:
    "Add a column calories_per_single_unit and include the number of calories for each food item, for 1 unit of its quantity",
  schema: OutputSchema,
});

console.log(response);
