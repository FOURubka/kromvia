import { expect, test } from "bun:test";
import { normGpu, projectsOf } from "../src/perf";

test("GPU names drop driver details", () => {
  expect(normGpu("NVIDIA GeForce RTX 3060/PCIe/SSE2")).toBe("nvidia geforce rtx 3060");
  expect(normGpu("AMD Radeon RX 6700 XT (radeonsi, navi22, LLVM 17.0.6)")).toBe("amd radeon rx 6700 xt");
  expect(normGpu(42)).toBe("");
});

test("project lists keep only Modrinth ids", () => {
  expect(projectsOf(["AANobbMI", "AANobbMI", "../x", 3])).toEqual(["AANobbMI"]);
});
