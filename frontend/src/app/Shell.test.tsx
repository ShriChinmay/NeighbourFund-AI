import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Shell } from "./Shell";

describe("Shell", () => {
  it("shows sandbox context and accessible navigation", () => {
    render(<MemoryRouter><Shell><h1>Test workspace</h1></Shell></MemoryRouter>);
    expect(screen.getByText("SANDBOX DEMO")).toBeInTheDocument();
    expect(screen.getByRole("navigation", { name: "Primary navigation" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Skip to main content" })).toHaveAttribute("href", "#main-content");
    expect(screen.getByRole("heading", { name: "Test workspace" })).toBeInTheDocument();
  });
  it("toggles mobile navigation and closes it on navigation", () => {
    render(<MemoryRouter><Shell><h1>Test workspace</h1></Shell></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(screen.getByRole("button", { name: "Close navigation" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("link", { name: "Project dashboard" }));
    expect(screen.getByRole("button", { name: "Open navigation" })).toHaveAttribute("aria-expanded", "false");
  });
});
