const Ajv = require('ajv');

const schema = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$ref": "#/definitions/Meals",
  "definitions": {
    "Meals": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "occasion": {
            "type": "string"
          },
          "food_items": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "food_name": {
                  "type": "string"
                },
                "quantity": {
                  "type": "number"
                },
                "quantity_unit": {
                  "type": "string"
                },
                "calories_per_unit": {
                  "type": "number"
                }
              },
              "required": [
                "food_name",
                "quantity",
                "quantity_unit",
                "calories_per_unit"
              ],
              "additionalProperties": false
            }
          }
        },
        "required": [
          "occasion",
          "food_items"
        ],
        "additionalProperties": false
      }
    }
  }
};

const data = {
  "Meals": [
    {
      "occasion": "breakfast",
      "food_items": [
        {
          "food_name": "banana",
          "quantity": 2,
          "quantity_unit": "each",
          "calories_per_unit": 105
        },
        {
          "food_name": "milk bread",
          "quantity": 1,
          "quantity_unit": "slice",
          "calories_per_unit": 80
        },
        {
          "food_name": "peanut butter",
          "quantity": 1,
          "quantity_unit": "tablespoon",
          "calories_per_unit": 190
        }
      ]
    },
    {
      "occasion": "dinner",
      "food_items": [
        {
          "food_name": "paradise biriyani chicken",
          "quantity": 1,
          "quantity_unit": "serving",
          "calories_per_unit": 450
        }
      ]
    }
  ]
};

const ajv = new Ajv();
const validate = ajv.compile(schema);

const valid = validate(data);

if (valid) {
  console.log('Data is valid!');
  console.log('Parsed data:', JSON.stringify(data, null, 2));
} else {
  console.log('Data is invalid!');
  console.log('Validation errors:', validate.errors);
}