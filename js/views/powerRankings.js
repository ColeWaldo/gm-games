/**
 * @name views.powerRankings
 * @namespace Power Rankings based on player ratings, stats, team performance
 */
define(["dao", "globals", "ui", "core/team", "core/player", "lib/jquery", "lib/underscore", "lib/knockout", "lib/knockout.mapping", "views/components", "util/bbgmView", "util/helpers", "util/viewHelpers"], function (dao, g, ui, team, player, $, _, ko, komapping, components, bbgmView, helpers, viewHelpers) {
    "use strict";

    var mapping;

    mapping = {
        teams: {
            create: function (options) {
                return options.data;
            }
        }
    };

    function updatePowerRankings(inputs, updateEvents, vm) {
        var deferred, tx;

        if (updateEvents.indexOf("firstRun") >= 0 || updateEvents.indexOf("dbChange") >= 0 || updateEvents.indexOf("gameSim") >= 0) {
            deferred = $.Deferred();

            tx = g.dbl.transaction(["players", "teams"]);

            team.filter({
                attrs: ["tid", "abbrev", "region", "name"],
                seasonAttrs: ["won", "lost", "lastTen"],
                stats: ["gp", "pts", "oppPts", "diff"],
                season: g.season,
                ot: tx
            }, function (teams) {
                dao.players.getAll({
                    ot: tx,
                    index: "tid",
                    key: IDBKeyRange.lowerBound(0),
                    statSeasons: []
                }, function (players) {
                    var i, j, overallRankMetric, playerValuesByTid, weights;

                    // Array of arrays, containing the values for each player on each team
                    playerValuesByTid = [];

                    for (i = 0; i < g.numTeams; i++) {
                        playerValuesByTid[i] = [];
                        teams[i].talent = 0;
                    }

                    // TALENT
                    // Get player values and sort by tid
                    for (i = 0; i < players.length; i++) {
                        playerValuesByTid[players[i].tid].push(players[i].valueNoPot);
                    }
                    // Sort and weight the values - doesn't matter how good your 12th man is
                    weights = [2, 1.5, 1.25, 1.1, 1, 0.9, 0.8, 0.7, 0.6, 0.4, 0.2, 0.1];
                    for (i = 0; i < playerValuesByTid.length; i++) {
                        playerValuesByTid[i].sort(function (a, b) { return b - a; });

                        for (j = 0; j < playerValuesByTid[i].length; j++) {
                            if (j < weights.length) {
                                teams[i].talent += weights[j] * playerValuesByTid[i][j];
                            }
                        }
                    }

                    // PERFORMANCE
                    for (i = 0; i < g.numTeams; i++) {
                        playerValuesByTid[i] = [];
                        // Modulate point differential by recent record: +5 for 10-0 in last 10 and -5 for 0-10
                        teams[i].performance = teams[i].diff - 5 + 5 * (parseInt(teams[i].lastTen.split("-")[0], 10)) / 10;
                    }

                    // RANKS
                    teams.sort(function (a, b) { return b.talent - a.talent; });
                    for (i = 0; i < teams.length; i++) {
                        teams[i].talentRank = i + 1;
                    }
                    teams.sort(function (a, b) { return b.performance - a.performance; });
                    for (i = 0; i < teams.length; i++) {
                        teams[i].performanceRank = i + 1;
                    }

                    // OVERALL RANK
                    // Weighted average depending on GP
                    overallRankMetric = function (t) {
                        if (t.gp < 10) {
                            return t.performanceRank * 4 * t.gp / 10 + t.talentRank * (30 - t.gp) / 10;
                        }

                        return t.performanceRank * 4 + t.talentRank * 2;
                    };
                    teams.sort(function (a, b) {
                        return overallRankMetric(a) - overallRankMetric(b);
                    });
                    for (i = 0; i < teams.length; i++) {
                        teams[i].overallRank = i + 1;
                    }

                    deferred.resolve({
                        teams: teams
                    });
                });
            });

            return deferred.promise();
        }
    }

    function uiFirst(vm) {
        ui.title("Power Rankings");

        ko.computed(function () {
            ui.datatableSinglePage($("#power-rankings"), 0, _.map(vm.teams(), function (t) {
                var performanceRank;
                performanceRank = t.gp > 0 ? String(t.performanceRank) : "-";
                return [String(t.overallRank), performanceRank, String(t.talentRank), '<a href="' + helpers.leagueUrl(["roster", t.abbrev]) + '">' + t.region + ' ' + t.name + '</a>', String(t.won), String(t.lost), t.lastTen, helpers.round(t.diff, 1), t.tid === g.userTid];
            }), {
                fnRowCallback: function (nRow, aData) {
                    // Show point differential in green or red for positive or negative
                    if (aData[aData.length - 2] > 0) {
                        nRow.childNodes[nRow.childNodes.length - 1].classList.add("text-success");
                    } else if (aData[aData.length - 2] < 0) {
                        nRow.childNodes[nRow.childNodes.length - 1].classList.add("text-danger");
                    }

                    // Highlight user team
                    if (aData[aData.length - 1]) {
                        nRow.classList.add("info");
                    }
                }
            });
        }).extend({throttle: 1});

        ui.tableClickableRows($("#power-rankings"));
    }

    return bbgmView.init({
        id: "powerRankings",
        mapping: mapping,
        runBefore: [updatePowerRankings],
        uiFirst: uiFirst
    });
});