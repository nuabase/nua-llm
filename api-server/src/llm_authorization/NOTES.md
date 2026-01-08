Our users can allow their end-users directly call Nuabase from the browser.

Our internal setup for this is as follows:

- In signing_keys table, we create a `secret`, that is stored in the table.
- It also returns a token, which is three parts: `pk_{client_id}.{key_id}.{secret}`. The client_id is our user_id. The developer saves it in their app as an env variable `NUABASE_SIGNING_KEY_SECRET`  

- Now when the developer's end-user wants to call Nuabase, using our ts-sdk, they pass a fetchToken function, which hits an endpoint of theirs (.well-known/nuabase/token as a convention), and there it will mint a JWT token.

- To mint it, the 3-part token is extracted, and the secret is used to sign the JWT using HS256.  

Notes:

signing_tables.secret is stored as `secret_ciphertext`, encrypted-at-rest, using a fixed env variable `ENCRYPTION_KEY_DB_STORAGE_SIGNING_KEY`. It is shared between console and api servers, so they can decrypt the original symmetric key to validate incoming JWT tokens.
