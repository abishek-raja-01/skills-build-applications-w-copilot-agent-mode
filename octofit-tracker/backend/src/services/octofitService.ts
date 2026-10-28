import mongoose from 'mongoose';
import { Activity, Team, User, Workout } from '../models/index.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export async function listActivities() {
  return Activity.find().lean();
}

export async function createActivity(input: unknown) {
  if (!isRecord(input)) {
    throw Object.assign(new Error('Activity request must be an object'), { status: 400 });
  }

  const { userId, teamId, type, minutes } = input;
  if (
    typeof userId !== 'string' ||
    !mongoose.isObjectIdOrHexString(userId) ||
    typeof teamId !== 'string' ||
    !mongoose.isObjectIdOrHexString(teamId) ||
    typeof type !== 'string' ||
    type.trim().length === 0 ||
    typeof minutes !== 'number' ||
    !Number.isFinite(minutes) ||
    minutes <= 0
  ) {
    throw Object.assign(new Error('Activity requires valid userId, teamId, type, and positive minutes'), { status: 400 });
  }

  const [user, team] = await Promise.all([User.findById(userId), Team.findById(teamId)]);
  if (!user || !team) {
    throw Object.assign(new Error('Activity user or team was not found'), { status: 404 });
  }

  return Activity.create({
    user: user._id,
    team: team._id,
    type: type.trim(),
    minutes,
    points: minutes,
    occurredAt: new Date(),
  });
}

export async function listTeams() {
  return Team.find().lean();
}

export async function createTeam(input: unknown) {
  if (!isRecord(input)) {
    throw Object.assign(new Error('Team request must be an object'), { status: 400 });
  }

  const { name, mascot, members = [] } = input;
  if (
    typeof name !== 'string' ||
    name.trim().length === 0 ||
    typeof mascot !== 'string' ||
    mascot.trim().length === 0 ||
    !Array.isArray(members) ||
    !members.every((member): member is string => typeof member === 'string' && mongoose.isObjectIdOrHexString(member))
  ) {
    throw Object.assign(new Error('Team requires a name, mascot, and valid member IDs'), { status: 400 });
  }

  const memberIds = [...new Set(members)];
  const users = await User.find({ _id: { $in: memberIds } });
  if (users.length !== memberIds.length) {
    throw Object.assign(new Error('One or more team members were not found'), { status: 404 });
  }

  return Team.create({
    name: name.trim(),
    mascot: mascot.trim(),
    members: users.map((user) => user._id),
  });
}

export async function getLeaderboard() {
  const totals = await Activity.aggregate<{ _id: mongoose.Types.ObjectId; totalPoints: number }>([
    { $group: { _id: '$team', totalPoints: { $sum: '$points' } } },
  ]);
  const pointsByTeam = new Map(totals.map(({ _id, totalPoints }) => [_id.toString(), totalPoints]));
  const teams = await Team.find().select('name').lean();

  return teams
    .map((team) => ({
      teamName: team.name,
      totalPoints: pointsByTeam.get(team._id.toString()) ?? 0,
    }))
    .sort((left, right) => right.totalPoints - left.totalPoints || left.teamName.localeCompare(right.teamName))
    .map((team, index) => ({ ...team, rank: index + 1 }));
}

export async function suggestWorkouts(userEmail: string) {
  const user = await User.findOne({ email: userEmail }).lean();
  if (!user) {
    throw Object.assign(new Error('User was not found'), { status: 404 });
  }

  const recentActivity = await Activity.findOne({ user: user._id }).sort({ occurredAt: -1 }).lean();
  const preferredFocuses = [user.fitnessGoal, recentActivity?.type].filter((focus): focus is string => Boolean(focus));
  const workouts = await Workout.find({ focus: { $in: preferredFocuses } }).lean();
  const focusPriority = new Map(preferredFocuses.map((focus, index) => [focus, index]));

  return workouts
    .sort((left, right) => (focusPriority.get(left.focus) ?? Number.MAX_SAFE_INTEGER) - (focusPriority.get(right.focus) ?? Number.MAX_SAFE_INTEGER))
    .map((workout) => ({
      ...workout,
      reason: workout.focus === user.fitnessGoal
        ? `Matches your ${user.fitnessGoal} fitness goal`
        : `Recommended based on your recent ${recentActivity?.type ?? workout.focus} activity`,
    }));
}

export { User };
