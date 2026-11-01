import { Session, SessionTask } from "./programmeSessions";

/**
 * The programme for a position player.
 *
 * The plan was written for a pitcher. A position player keeps everything that
 * is not about the mound — the warm-up, the gym, the speed and conditioning
 * work, recovery — and loses the pitcher's throwing: plyo balls, bullpens and
 * pulldowns, post-throw arm care and the pitcher's catch on club nights. Their
 * throwing is set by the team, not by this plan.
 *
 * The game day's Compete stage stays, reworded for at-bats, so the game is
 * still on the day and the at-bat log sits where the game is.
 */
const PITCHING_STAGES = new Set(["Plyo Ball Preparation", "Throw", "Arm Care", "Team Throwing"]);

export function isPitchingTask(task: Pick<SessionTask, "stageTitle">): boolean {
  return PITCHING_STAGES.has(String(task.stageTitle).trim());
}

export function asPositionPlayer(session: Session): Session {
  const tasks = session.tasks
    .filter((task) => !isPitchingTask(task))
    .map((task) =>
      task.stageTitle === "Compete"
        ? {
            ...task,
            name: "Game — at-bats",
            prescription: "Play the game · log each at-bat on the Hitting tab",
            cue: "Log at-bats as they happen or straight after: result, where it went, and whether it was a quality at-bat.",
          }
        : task
    );
  return {
    ...session,
    // The day's headline is usually about the arm ("Velocity day", "Bullpen");
    // when it is, it no longer describes the day.
    focus: /bullpen|pulldown|plyo|throw|command|velocity|mound|pitch/i.test(String(session.focus ?? ""))
      ? "Strength, speed and recovery"
      : session.focus,
    // The day's write-up is about the pitcher's arm; a position player's
    // throwing is the team's, so the pitcher's reasoning would only mislead.
    description: /bullpen|pulldown|plyo|throw|catch|arm|mound|pitch/i.test(String(session.description ?? ""))
      ? "Gym, speed and recovery from the programme. Your throwing is set at team training, so none is prescribed here."
      : session.description,
    tasks,
  };
}
