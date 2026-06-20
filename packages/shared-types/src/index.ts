import { z } from "zod";

export const roleSchema = z.enum(["admin", "member", "viewer"]);
export const integrationKindSchema = z.enum([
  "tapo",
  "xiaomi",
  "tuya",
  "mqtt",
  "matter",
  "zigbee",
  "philips_hue",
  "wiz",
  "lifx",
  "govee",
  "wipro",
  "syska",
  "shelly",
  "sonoff",
  "custom",
]);

export const deviceSchema = z.object({
  id: z.string(),
  name: z.string(),
  deviceType: z.string(),
  vendor: z.string(),
  online: z.boolean(),
  roomId: z.string().nullable().optional(),
  integrationId: z.string(),
  metadata: z.record(z.any()).default({}),
});

export type Role = z.infer<typeof roleSchema>;
export type IntegrationKind = z.infer<typeof integrationKindSchema>;
export type Device = z.infer<typeof deviceSchema>;
