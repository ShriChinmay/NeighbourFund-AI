import { describe,it,expect } from "vitest";
import { createApp } from "../../../app.js";
import request from "supertest";
describe("funding route protection",()=>{
  it("requires auth for feasibility",async()=>{
    const r=await request(createApp()).post("/api/projects/00000000-0000-4000-8000-000000000001/feasibility").send({});
    expect(r.status).toBe(401);
  });
  it("requires auth for plan acceptance",async()=>{
    const r=await request(createApp()).post("/api/projects/00000000-0000-4000-8000-000000000001/funding-plan/accept").send({});
    expect(r.status).toBe(401);
  });
  it("rejects malformed project ids for public slots",async()=>{
    const r=await request(createApp()).get("/api/projects/not-a-uuid/slots");
    expect(r.status).toBe(400);
  });
});
