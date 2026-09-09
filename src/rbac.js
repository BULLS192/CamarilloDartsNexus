export const NEXUS_ROLES = Object.freeze({
  OWNER: 'owner',
  ADMIN: 'admin',
  LEAGUE_DIRECTOR: 'league_director',
  TOURNAMENT_DIRECTOR: 'tournament_director',
  CAPTAIN: 'captain',
  PLAYER: 'player',
  MEMBER: 'member',
});

export const NEXUS_PERMISSIONS = Object.freeze({
  ORGANIZATION_VIEW: 'organization.view',
  ORGANIZATION_MANAGE: 'organization.manage',
  ORGANIZATION_DELETE: 'organization.delete',
  OWNERSHIP_TRANSFER: 'ownership.transfer',
  MEMBERS_VIEW: 'members.view',
  MEMBERS_MANAGE: 'members.manage',
  ROLES_ASSIGN: 'roles.assign',

  VENUES_VIEW: 'venues.view',
  VENUES_MANAGE: 'venues.manage',
  COMPETITIONS_VIEW: 'competitions.view',
  REGISTRATIONS_VIEW_SELF: 'registrations.view_self',
  REGISTRATIONS_MANAGE: 'registrations.manage',
  MATCHES_VIEW: 'matches.view',
  STANDINGS_VIEW: 'standings.view',

  LEAGUES_VIEW: 'leagues.view',
  LEAGUES_CREATE: 'leagues.create',
  LEAGUES_MANAGE: 'leagues.manage',
  TOURNAMENTS_VIEW: 'tournaments.view',
  TOURNAMENTS_CREATE: 'tournaments.create',
  TOURNAMENTS_MANAGE: 'tournaments.manage',
  TEAMS_VIEW: 'teams.view',
  TEAMS_MANAGE: 'teams.manage',
  SCORES_SUBMIT: 'scores.submit',
  SCORES_CONFIRM: 'scores.confirm',
  STATS_VIEW_SELF: 'stats.view_self',
  STATS_VIEW_ORG: 'stats.view_org',
});

const P = NEXUS_PERMISSIONS;

const UNIVERSAL_READ = [
  P.ORGANIZATION_VIEW,
  P.VENUES_VIEW,
  P.COMPETITIONS_VIEW,
  P.MATCHES_VIEW,
  P.STANDINGS_VIEW,
];

const PLAYER_READ = [
  ...UNIVERSAL_READ,
  P.MEMBERS_VIEW,
  P.LEAGUES_VIEW,
  P.TOURNAMENTS_VIEW,
  P.TEAMS_VIEW,
];

export const ROLE_DEFINITIONS = Object.freeze({
  [NEXUS_ROLES.OWNER]: {
    label: 'Owner',
    rank: 100,
    permissions: Object.values(P),
  },
  [NEXUS_ROLES.ADMIN]: {
    label: 'Admin',
    rank: 90,
    permissions: Object.values(P).filter(
      (permission) => ![P.ORGANIZATION_DELETE, P.OWNERSHIP_TRANSFER].includes(permission),
    ),
  },
  [NEXUS_ROLES.LEAGUE_DIRECTOR]: {
    label: 'League Director',
    rank: 70,
    permissions: [
      ...PLAYER_READ,
      P.LEAGUES_CREATE,
      P.LEAGUES_MANAGE,
      P.REGISTRATIONS_VIEW_SELF,
      P.REGISTRATIONS_MANAGE,
      P.SCORES_SUBMIT,
      P.SCORES_CONFIRM,
      P.STATS_VIEW_SELF,
      P.STATS_VIEW_ORG,
    ],
  },
  [NEXUS_ROLES.TOURNAMENT_DIRECTOR]: {
    label: 'Tournament Director',
    rank: 70,
    permissions: [
      ...PLAYER_READ,
      P.TOURNAMENTS_CREATE,
      P.TOURNAMENTS_MANAGE,
      P.REGISTRATIONS_VIEW_SELF,
      P.REGISTRATIONS_MANAGE,
      P.SCORES_SUBMIT,
      P.SCORES_CONFIRM,
      P.STATS_VIEW_SELF,
      P.STATS_VIEW_ORG,
    ],
  },
  [NEXUS_ROLES.CAPTAIN]: {
    label: 'Captain',
    rank: 50,
    permissions: [
      ...PLAYER_READ,
      P.TEAMS_MANAGE,
      P.REGISTRATIONS_VIEW_SELF,
      P.SCORES_SUBMIT,
      P.STATS_VIEW_SELF,
    ],
  },
  [NEXUS_ROLES.PLAYER]: {
    label: 'Player',
    rank: 30,
    permissions: [
      ...PLAYER_READ,
      P.REGISTRATIONS_VIEW_SELF,
      P.SCORES_SUBMIT,
      P.STATS_VIEW_SELF,
    ],
  },
  [NEXUS_ROLES.MEMBER]: {
    label: 'Member',
    rank: 10,
    permissions: [
      ...UNIVERSAL_READ,
      P.LEAGUES_VIEW,
      P.TOURNAMENTS_VIEW,
      P.TEAMS_VIEW,
    ],
  },
});

export function normalizeRoles(roles = []) {
  return [...new Set((Array.isArray(roles) ? roles : [roles]).filter((role) => ROLE_DEFINITIONS[role]))];
}

export function effectivePermissions(roles = []) {
  const permissionSet = new Set();
  for (const role of normalizeRoles(roles)) {
    for (const permission of ROLE_DEFINITIONS[role].permissions) permissionSet.add(permission);
  }
  return [...permissionSet].sort();
}

export function hasPermission(roles, permission) {
  return effectivePermissions(roles).includes(permission);
}

export function highestRole(roles = []) {
  return normalizeRoles(roles)
    .map((role) => ({ code: role, ...ROLE_DEFINITIONS[role] }))
    .sort((a, b) => b.rank - a.rank)[0] || null;
}

export function roleLabel(role) {
  return ROLE_DEFINITIONS[role]?.label || role;
}
