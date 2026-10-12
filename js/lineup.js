// Who was in the band when, for "the band that night" and the lineup strip under each song's chart.
// Dates from MusicBrainz's member relationships and Wikipedia's member list: LeRoi Moore's last show was
// June 28, 2008 (he was hurt two days later and died that August); Jeff Coffin filled in from that summer's tour.
// Boyd Tinsley left in February 2018. Touring players are included, since they were on stage every night.

export const LINEUP = [
  { name: 'Dave Matthews', short: 'Dave', role: 'guitar and vocals', from: '1991-01-01' },
  { name: 'Carter Beauford', short: 'Carter', role: 'drums', from: '1991-01-01' },
  { name: 'Stefan Lessard', short: 'Stefan', role: 'bass', from: '1991-01-01' },
  { name: 'LeRoi Moore', short: 'LeRoi', role: 'saxophone', row: 'Sax', from: '1991-01-01', to: '2008-06-28' },
  { name: 'Jeff Coffin', short: 'Jeff', role: 'saxophone', row: 'Sax', from: '2008-06-29' },
  { name: 'Boyd Tinsley', short: 'Boyd', role: 'violin', row: 'Violin', from: '1992-01-01', to: '2018-02-02' },
  { name: 'Peter Griesar', short: 'Peter', role: 'keyboards', row: 'Keys', from: '1991-01-01', to: '1993-03-23' },
  { name: 'Butch Taylor', short: 'Butch', role: 'keyboards', row: 'Keys', from: '2001-01-01', to: '2008-05-27' },
  { name: 'Buddy Strong', short: 'Buddy', role: 'keyboards', row: 'Keys', from: '2018-02-03' },
  { name: 'Rashawn Ross', short: 'Rashawn', role: 'trumpet', row: 'Trumpet', from: '2006-01-01' },
  { name: 'Tim Reynolds', short: 'Tim', role: 'lead guitar', row: 'Guitar', from: '2008-06-01' },
];

// The rows of the lineup strip, in the order they're drawn.
export const ROWS = ['Sax', 'Violin', 'Keys', 'Trumpet', 'Guitar'];

export function bandOn(date) {
  return LINEUP.filter(p => p.from <= date && (!p.to || date <= p.to));
}
