import { PHASE } from "../../../common";
import finalize from "./finalize";
import newPhasePreseason from "./newPhasePreseason";
import newPhaseRegularSeason from "./newPhaseRegularSeason";
import newPhasePlayoffs from "./newPhasePlayoffs";
import newPhaseBeforeDraft from "./newPhaseBeforeDraft";
import newPhaseDraft from "./newPhaseDraft";
import newPhaseAfterDraft from "./newPhaseAfterDraft";
import newPhaseResignPlayers from "./newPhaseResignPlayers";
import newPhaseFreeAgency from "./newPhaseFreeAgency";
import newPhaseFantasyDraft from "./newPhaseFantasyDraft";
import newPhaseExpansionDraft from "./newPhaseExpansionDraft";
import { g, lock, logEvent, updatePlayMenu, updateStatus } from "../../util";
import type { Conditions, Phase, PhaseReturn } from "../../../common/types";

/**
 * Set a new phase of the game.
 *
 * @memberOf core.phase
 * @param {number} phase Numeric phase ID. This should always be one of the PHASE.* variables defined in globals.js.
 * @param {} extra Parameter containing extra info to be passed to phase changing function. Currently only used for newPhaseFantasyDraft.
 * @return {Promise}
 */
const newPhase = async (phase: Phase, conditions: Conditions, extra?: any) => {
	// Prevent at least some cases of code running twice
	if (phase === g.get("phase")) {
		return;
	}

	if (g.get("phase") < 0) {
		throw new Error(
			"Can't call newPhase when expansion/fantasy draft is in progress",
		);
	}

	const phaseChangeInfo = {
		[PHASE.PRESEASON]: {
			func: newPhasePreseason,
		},
		[PHASE.REGULAR_SEASON]: {
			func: newPhaseRegularSeason,
		},
		[PHASE.PLAYOFFS]: {
			func: newPhasePlayoffs,
		},
		[PHASE.DRAFT_LOTTERY]: {
			func: newPhaseBeforeDraft,
		},
		[PHASE.DRAFT]: {
			func: newPhaseDraft,
		},
		[PHASE.AFTER_DRAFT]: {
			func: newPhaseAfterDraft,
		},
		[PHASE.RESIGN_PLAYERS]: {
			func: newPhaseResignPlayers,
		},
		[PHASE.FREE_AGENCY]: {
			func: newPhaseFreeAgency,
		},
		[PHASE.FANTASY_DRAFT]: {
			func: newPhaseFantasyDraft,
		},
		[PHASE.EXPANSION_DRAFT]: {
			func: newPhaseExpansionDraft,
		},
	};

	if (lock.get("newPhase")) {
		logEvent(
			{
				type: "error",
				text: "Phase change already in progress.",
				saveToDb: false,
			},
			conditions,
		);
	} else {
		try {
			await lock.set("newPhase", true);
			await updateStatus("Processing...");
			await updatePlayMenu();

			if (phaseChangeInfo.hasOwnProperty(phase)) {
				const result: PhaseReturn = await phaseChangeInfo[phase].func(
					conditions,
					extra,
				);

				if (result) {
					await finalize(phase, conditions, result);
				} else {
					throw new Error(
						`Invalid result from phase change: ${JSON.stringify(result)}`,
					);
				}
			} else {
				throw new Error(`Unknown phase number ${phase}`);
			}
		} catch (err) {
			await lock.set("newPhase", false);
			await updatePlayMenu();
			logEvent(
				{
					type: "error",
					text:
						'Critical error during phase change. <a href="https://basketball-gm.com/manual/debugging/"><b>Read this to learn about debugging.</b></a>',
					saveToDb: false,
					persistent: true,
				},
				conditions,
			);
			throw err;
		}
	}
};

export default newPhase;