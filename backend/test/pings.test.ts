import { expect, test } from "bun:test";
import { pingsOff } from "../src/hub";

test("pings are off on PvP servers and their subdomains", () => {
  expect(pingsOff("hypixel.net")).toBe(true);
  expect(pingsOff("MC.Hypixel.NET:25565")).toBe(true);
  expect(pingsOff("eu.minemen.club.")).toBe(true);
  expect(pingsOff("play.example.org")).toBe(false);
  expect(pingsOff("nothypixel.net")).toBe(false);
});
