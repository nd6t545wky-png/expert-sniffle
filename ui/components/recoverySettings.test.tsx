/**
 * The two settings the recovery protocol used to hardcode.
 *
 * Tested through the card rather than only through the readers, because the
 * failure that matters is a toggle that silently drops the rest of the kit —
 * the athlete would see one box change and lose four blocks from tomorrow's
 * plan with nothing to connect the two.
 */

import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { RecoverySettings } from "./RecoverySettings";
import { DEFAULT_TEAM_TRAINING } from "../../src/domain/teamTraining";
import { EQUIPMENT_LABELS, INTENT_PERCENT, RecoveryEquipment } from "../../src/domain/recoveryProtocol";

afterEach(cleanup);

describe("recovery settings", () => {
  it("turns kit off without disturbing the rest", () => {
    const changes: RecoveryEquipment[][] = [];
    render(
      <RecoverySettings
        equipment={["cups", "scraper", "heat"]}
        intentPercent={INTENT_PERCENT}
        teamTraining={DEFAULT_TEAM_TRAINING}
        onTeamTraining={() => {}}
        onEquipment={(next) => changes.push(next)}
        onIntentPercent={() => {}}
      />
    );
    fireEvent.click(screen.getByLabelText(EQUIPMENT_LABELS.cups));
    expect(changes[0]).toEqual(["scraper", "heat"]);
  });

  it("turns kit on without dropping what was already there", () => {
    const changes: RecoveryEquipment[][] = [];
    render(
      <RecoverySettings
        equipment={["cups"]}
        intentPercent={INTENT_PERCENT}
        teamTraining={DEFAULT_TEAM_TRAINING}
        onTeamTraining={() => {}}
        onEquipment={(next) => changes.push(next)}
        onIntentPercent={() => {}}
      />
    );
    fireEvent.click(screen.getByLabelText(EQUIPMENT_LABELS.heat));
    expect(new Set(changes[0])).toEqual(new Set(["cups", "heat"]));
  });

  it("shows every piece of kit, ticked to match what is owned", () => {
    render(
      <RecoverySettings
        equipment={["cups"]}
        intentPercent={INTENT_PERCENT}
        teamTraining={DEFAULT_TEAM_TRAINING}
        onTeamTraining={() => {}}
        onEquipment={() => {}}
        onIntentPercent={() => {}}
      />
    );
    for (const [id, label] of Object.entries(EQUIPMENT_LABELS)) {
      const box = screen.getByLabelText(label) as HTMLInputElement;
      expect(box.checked, label).toBe(id === "cups");
    }
  });

  it("edits one intent word and leaves the others alone", () => {
    const changes: Record<string, number>[] = [];
    render(
      <RecoverySettings
        equipment={[]}
        intentPercent={INTENT_PERCENT}
        teamTraining={DEFAULT_TEAM_TRAINING}
        onTeamTraining={() => {}}
        onEquipment={() => {}}
        onIntentPercent={(next) => changes.push(next)}
      />
    );
    fireEvent.change(screen.getByLabelText("moderate"), { target: { value: "85" } });
    expect(changes[0]).toEqual({ ...INTENT_PERCENT, moderate: 85 });
  });
});
