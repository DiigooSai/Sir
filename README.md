# Nige Ecosystem Server

## Throwing Error/////

Always throw error like
throw new ApiError(500, "Not Implemented");
can refer to class ApiError in utils/ApiError.ts

## Sending Responses

Always send response like
return c.json(new ApiResponse(200, data));
can refer to class ApiResponse in utils/ApiResponse.ts

We are taking this approach because we want to have a consistent response format for all our APIs. This will make it easier to understand and handle errors and responses in the frontend.

## Environment Variables

We are using Zod to validate the environment variables.
You can refer to the env.ts file for the validation logic.
You just need to add environment variables to the zod object (envVariables) env.ts file whenever you add a new environment variable.

<!-- conflict -->

src/shared/auth/auth.service.ts
Type 'typeof import("/Users/saranshkhulbe/Documents/Projects/palnesto/nige-ecosystem/nige-ecosystem-server/node_modules/@types/jsonwebtoken/index")' is not assignable to type 'string'.ts(2322)
auth.service.ts(27, 14): The expected type comes from property 'jwt' which is declared here on type '{ jwt: string; account: (Document<unknown, {}, IAccount, {}> & IAccount & { \_id: ObjectId; } & { \_\_v: number; })[]; }'

at
return { jwt, account };

src/apps/nige-earn/services/reward-settings.service.ts
Type 'void | (Document<unknown, any, any, Record<string, any>> & IRewardSettings & Required<{ \_id: unknown; }> & { \_\_v: number; })' is not assignable to type 'IRewardSettings'.
Type 'void' is not assignable to type 'IRewardSettings'.ts(2322)

at
return runInTransaction(async (session: ClientSession) => {
// 1) Grab or create the one‐and‐only doc
let settings = await RewardSettingsModel.findOne().session(session);
if (!settings) {
// create with defaults

2. burn coins (must have LEDGER_BURN permission) surely work for super admin because of ['*']
3. reward setting

<!-- test -->

<!-- _id: aryan
name: Aryan
imageUrl: https://test-assets.nigeglobal.com/nige-nest/avatars/aryan.png

_id: erik
name: Erik
imageUrl: https://test-assets.nigeglobal.com/nige-nest/avatars/erik.png

_id: felix
name: Felix
imageUrl: https://test-assets.nigeglobal.com/nige-nest/avatars/felix.png

_id: jabari
name: Jabari
imageUrl: https://test-assets.nigeglobal.com/nige-nest/avatars/jabari.png

_id: kairos
name: Kairos
imageUrl: https://test-assets.nigeglobal.com/nige-nest/avatars/kairos.png

_id: orion
name: Orion
imageUrl: https://test-assets.nigeglobal.com/nige-nest/avatars/orion.png

_id: veer
name: Veer
imageUrl: https://test-assets.nigeglobal.com/nige-nest/avatars/veer.png

_id: zuberi
name: Zuberi
imageUrl: https://test-assets.nigeglobal.com/nige-nest/avatars/zuberi.png -->
