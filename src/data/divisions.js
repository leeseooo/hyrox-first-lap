// HYROX official Singles and Doubles rulebooks, Season 26/27, Open divisions.
// Sled loads include the sled. Carry is the load of EACH kettlebell.
export const season = '26/27';
export const divisions = [
  {
    id: 'men-single',
    label: 'Men Single',
    doubles: false,
    sex: 'male',
    push: 152,
    pull: 103,
    carry: 24,
    bag: 20,
    ball: 6,
  },
  {
    id: 'women-single',
    label: 'Women Single',
    doubles: false,
    sex: 'female',
    push: 102,
    pull: 78,
    carry: 16,
    bag: 10,
    ball: 4,
  },
  {
    id: 'mixed-doubles',
    label: 'Mixed Doubles',
    doubles: true,
    sex: null,
    push: 152,
    pull: 103,
    carry: 24,
    bag: 20,
    ball: 6,
  },
  {
    id: 'women-doubles',
    label: 'Women Doubles',
    doubles: true,
    sex: 'female',
    push: 102,
    pull: 78,
    carry: 16,
    bag: 10,
    ball: 4,
  },
  {
    id: 'men-doubles',
    label: 'Men Doubles',
    doubles: true,
    sex: 'male',
    push: 152,
    pull: 103,
    carry: 24,
    bag: 20,
    ball: 6,
  },
];
export function makeProfile(id, role = 'male') {
  const d = divisions.find((d) => d.id === id);
  if (!d) throw new Error('Choose a supported Open division.');
  if (!['male', 'female'].includes(role)) throw new Error('Choose male or female.');
  const playerSex = d.sex || role,
    partnerSex = d.sex || (playerSex === 'male' ? 'female' : 'male');
  return {
    ...d,
    playerSex,
    partnerSex,
    targetHeight: playerSex === 'female' ? 2.7 : 3,
    partnerTargetHeight: partnerSex === 'female' ? 2.7 : 3,
  };
}
export function stationLoad(profile, i, partner = false) {
  return [
    '',
    `${profile.push} kg · including sled`,
    `${profile.pull} kg · including sled`,
    '',
    '',
    `2 × ${profile.carry} kg`,
    `${profile.bag} kg`,
    `${profile.ball} kg · ${(partner ? profile.partnerTargetHeight : profile.targetHeight).toFixed(2)} m target`,
  ][i];
}
