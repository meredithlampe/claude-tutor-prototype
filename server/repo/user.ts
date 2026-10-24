import type { User } from "../types";
import { readJson } from "./jsonFile";

export function getUser(): Promise<User> {
  return readJson<User>("user.json");
}
