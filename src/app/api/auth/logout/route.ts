import { clearSessionCookies } from "@/lib/auth";
import { jsonOk } from "@/lib/api";

export async function POST() {
  const response = jsonOk({ success: true });
  clearSessionCookies(response);
  return response;
}
