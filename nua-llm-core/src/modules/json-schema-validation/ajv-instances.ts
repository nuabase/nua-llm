import Ajv from "ajv";
import Ajv2019 from "ajv/dist/2019";
import Ajv2020 from "ajv/dist/2020";
import draft7MetaSchema from "ajv/dist/refs/json-schema-draft-07.json";
import draft6MetaSchema from "ajv/dist/refs/json-schema-draft-06.json";

const ajvOptions = {
  allErrors: true,
  strict: true,
  strictSchema: true,
  strictNumbers: true,
  strictRequired: true,
};

// Singleton AJV instances - initialized once at module load
class AjvInstances {
  public readonly draft07: Ajv;
  public readonly draft2019: Ajv2019;
  public readonly draft2020: Ajv2020;

  constructor() {
    // Draft-07 (default)
    this.draft07 = new Ajv(ajvOptions);

    // Draft-2019-09 with backward compatibility
    this.draft2019 = new Ajv2019(ajvOptions);
    this.draft2019.addMetaSchema(draft7MetaSchema);
    this.draft2019.addMetaSchema(draft6MetaSchema);

    // Draft-2020-12
    this.draft2020 = new Ajv2020(ajvOptions);
  }

  getInstanceForSchema(schema: object): Ajv | Ajv2019 | Ajv2020 {
    const schemaVersion = (schema as any).$schema;

    if (!schemaVersion) {
      // Default to draft-07 if no $schema specified
      return this.draft07;
    }

    if (
      schemaVersion.includes("draft/2020-12") ||
      schemaVersion.includes("draft-2020-12")
    ) {
      return this.draft2020;
    }

    if (
      schemaVersion.includes("draft/2019-09") ||
      schemaVersion.includes("draft-2019-09")
    ) {
      return this.draft2019;
    }

    // For draft-07, draft-06, or unrecognized versions, use draft-07 with backward compatibility
    return this.draft07;
  }
}

// Singleton instance
export const ajvInstances = new AjvInstances();
