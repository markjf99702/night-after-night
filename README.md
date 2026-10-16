# Night After Night

**Use it: [night-after-night.junkdrawer.works](https://night-after-night.junkdrawer.works/)**

**Every song Dave Matthews Band has released from the stage, how each one changed from 1992 to now, and every show the band has played.** Pick a song and every official live version is on a timeline: how long it ran each night against the album version, with the band's lineup underneath, so you can watch Two Step grow from nine minutes to nineteen. Under it, how often the band has played it each year, from the setlists of more than 2,100 shows in the [DMB Almanac](https://dmbalmanac.com/). Or tell it how long you've got and it writes you a show from those recordings, each song from a real night, in an order learned from how the band actually sequences its sets, landing within seconds of your time.

<p align="center">
  <img src="docs/phone-build.png" alt="A 90-minute setlist written in marker on a taped-up sheet of paper, from Proudest Monkey to #41: each song with its length, the date and the venue it was recorded at, under the choices for how long you’ve got" width="250">
  &nbsp;
  <img src="docs/phone-song.png" alt="Two Step: played at 879 shows since 1992, with 74 official live versions. Dots for each released version climbing from about 8 minutes to about 18, a dashed line at the 6:27 album version, and bars underneath for LeRoi, Jeff, Boyd, Butch, Buddy, Rashawn and Tim" width="250">
  &nbsp;
  <img src="docs/phone-night.png" alt="Tuesday, December 8, 1998 at the Worcester Centrum Centre, Live Trax Vol. 1: the setlist from Seek Up onward with a bar for each song's length, and who was on stage" width="250">
</p>

Step back from one song or one night and every show says more: which songs were on stage years before their album, what the band plays into and out of each song, and what each year on the road looked like.

<p align="center">
  <img src="docs/phone-before.png" alt="Busted Stuff, July 16, 2002: 10 of its 11 songs were on stage first. A line for each on a timeline from 1995 to 2020, from the first time it was played live to the album: Raven 6 years 11 months, Captain 6 years 1 month, Bartender 3 years 6 months, Digging a Ditch 3 years 5 months, Grey Street 2 years 1 month, down to Where Are You Going, 9 months" width="250">
  &nbsp;
  <img src="docs/phone-flow.png" alt="Following Ants Marching, at 1,237 shows: what came right before it (#36 98 times, Two Step 78, Everyday 73) and right after it (the end of the night 353 times, All Along the Watchtower 61, Christmas Song 36), with the straight-through segues marked in red" width="250">
  &nbsp;
  <img src="docs/phone-year.png" alt="2008: 52 shows played, 13 released, 5 of them whole; a show ran about 20 songs. Who was on stage, Butch Taylor leaving, Tim Reynolds joining, LeRoi Moore's last show and Jeff Coffin taking over, then the songs played at the most shows: Corn Bread 47, So Damn Lucky 41, Anyone Seen the Bridge? 39" width="250">
</p>

## How it works

- **Build a show.** Pick 30 minutes, an hour, a whole show, or any length to the five minutes. Narrow it to a decade or two, the LeRoi Moore years, or a few favorite venues (the Gorge, Alpine Valley, SPAC…), lean towards the big ones or the deep cuts, short versions or long jams. It picks the songs, then the versions, then shuffles versions until the total lands within a few seconds of what you asked for.
- **In a believable order.** The opener is something that tends to open (Seek Up, One Sweet World, The Stone), the last song something that tends to close (All Along the Watchtower, Ants Marching, Two Step), and in between each song tends to be followed by what follows it on the band's own nights. Pantala Naga Pampa never turns up without what it led into.
- **Tap a song on the setlist** to swap in another night's version, a different song of about the same length, or take it out. Copy the list, share it as a link, or keep it on the phone. Each song links to a Spotify or Apple Music search for its release.
- **Songs.** Every song with a little picture of its versions over the years and how many shows it's been played at. Sort by how often it's been released or played, how long it runs, or how much longer than the album it got. Each song's page has the timeline, how often it was played each year, its typical length with each version of the band, when it was first and last played, the longest it went unplayed, how many shows it opened and closed, what it's usually followed by, the bits of other songs heard inside it, and every version. The hundred or so songs the band has played but never released have pages too: Bismarck, Singing From the Windows, covers like Sugar Man.
- **Nights.** Every show the band has played, from Trax in Charlottesville in 1991 to October 2026. A night with an official release has its setlist with the length of every song and who was on stage; a night released only in part, or not at all, has its whole setlist from the Almanac, with the released songs' lengths beside them. Every one links to its page on the Almanac. Search for a venue or a town to find every show there.
- **Before the album.** Ninety-nine songs that were played live before the album they're on came out, each a line from the first time it was played to the album's release day: Bartender and Grey Street years ahead of Busted Stuff, Idea of You twelve years ahead of Come Tomorrow, Break Free nearly seventeen years ahead of Walk Around the Moon. Below them, the songs that have never been on a studio album.
- **What leads where.** For any song, what the band played right before it and right after it at more than 2,100 shows, and how often it ran straight through without a break. On a wide screen it's a map with the song in the middle; tap a song to follow the thread through a night. Also the pairs the band keeps together (Pantala Naga Pampa into Rapunzel 569 times out of 607), the runs of three it plays most, and the likeliest night: start at the top and keep playing whatever most often came next.
- **A page for each year.** A chart at the top of Nights shows how many shows the band played each year, how many were released, and how long a whole night ran. Each year's page has the albums out that year, who was on stage and who joined or left, the songs played at the most shows, how the shows began and ended, the songs played for the first time, the ones back after the longest time away (Water Into Wine in 2008, after 701 shows), the longest released versions, and every show.
- No account and no server. Kept shows, your choices and the show on the paper stay in your browser, so the show comes back after a reload or when the app is opened again. It works offline and installs to a phone's home screen.

## The data

Every show's date, place and setlist comes from the [DMB Almanac](https://dmbalmanac.com/), the fans' record of every show since 1991, used with the permission of its team, who shared a snapshot of it for this project. Only the dates, places, songs in order and segues are used, credited on every page, and every show links back to its page on the Almanac; the Almanac's notes, song timings, stats and reviews stay there. `node tools/almanac.mjs path/to/dmb_almanac.sqlite` reads the snapshot, which isn't in this repo, and writes `js/shows.js`.

- **The band's shows** are the ones on the band's tour legs as the Almanac files them, plus any one-off that matches one of the band's official releases. Dave & Tim, Dave's solo shows and guest spots, the members' side projects, radio and TV sessions, the 2020 livestreams and each year's other one-offs are counted separately, so a song's plays and gaps are the band's own, while the first time it was played anywhere (on its page, and in Before the album) can be one of those. The snapshot numbers the Almanac's tours without naming them, so the band's tour legs were picked out by their shows, and an unreleased one-off by the whole band (a full show in Roanoke two weeks before the 1998 tour, a festival set) is counted with the rest; the tours' names would sort those out.
- **Songs** are matched to the ones from MusicBrainz however the Almanac spells them; a few notes of one song inside another (a tease), a false start and a jam between songs don't count as playing it.
- **Towns** are told apart from venue names ("The Gorge Amphitheatre George, WA") with [GeoNames](https://www.geonames.org/)' list of towns (CC BY 4.0).
- New shows come in with a fresh snapshot from the Almanac.

Every recording comes from [MusicBrainz](https://musicbrainz.org/artist/07e748f1-075e-428d-85dc-ce3be434e906), whose data is public domain: all of the band's official releases (the Live Trax series, DMBLive, the live albums, Warehouse fan-club discs, SiriusXM broadcasts) with their tracks and lengths, and each recording's date, venue and song. `node tools/musicbrainz.mjs` fetches them and writes `js/data.js`; run it again after a new release appears there (behind a proxy, Node 22 needs `NODE_USE_ENV_PROXY=1`).

- **Dates** come from the recording itself where MusicBrainz has it, then from the disc or release title, read month first as DMB's releases write them. A track that can't be dated is left out.
- **Songs** are matched however a release spells them ("Corn Bread" and "Cornbread", "Rhyme and Reason" and "Rhyme & Reason"), with typos caught by spelling. Intros, jams between songs, solos and the encore break aren't counted as songs, and a track called "Pantala Naga Pampa > Rapunzel" counts for both.
- **The album version** is the studio album the song is on. For songs on Remember Two Things and a later album, it's the later one, since Remember Two Things was partly recorded live. The songs from Dave's Some Devil are measured against that album.
- **The lineup** is from MusicBrainz's member list and Wikipedia: LeRoi Moore's last show was June 28, 2008, and Jeff Coffin played sax from that summer; Boyd Tinsley left in February 2018. Touring players who were on stage every night (Butch Taylor, Rashawn Ross) are included.
- Mistakes in MusicBrainz show up here. A few known ones are fixed in `tools/titles.mjs` (a 1994 show filed under 2004, Red Rocks' September 9, 2005 filed under the 10th, three songs from June 2018 with the day and month swapped, venues under old or misspelled names); better still, fix them on MusicBrainz and rebuild.

## Running it

It's a static site: plain HTML, CSS and JavaScript modules, with no build step.

```sh
npx serve .                   # or any static file server, then open the printed address
npm install                   # only for the tools below: esbuild and upng-js
npm test                      # the title reader, the show builder, the Almanac's shows, the insights and the charts, then the real page in Chromium (needs Playwright)
node tools/musicbrainz.mjs    # refreshes js/data.js from MusicBrainz (--report lists every song and venue)
node tools/almanac.mjs dmb_almanac.sqlite   # makes js/shows.js from the Almanac's snapshot (--report lists what it guessed); run it after js/data.js
node tools/screenshots.mjs    # redraws docs/*.png and og.png
node tools/make-icons.mjs     # redraws the PNG icons from icon.svg
npm run build                 # dist/night-after-night.html, the whole thing in one file
```

To put it online with GitHub Pages: **Settings → Pages → Build and deployment → Deploy from a branch**, then pick `main` and `/ (root)`.

### Files

- `js/data.js`: every night, track, song, venue and release, made by `tools/musicbrainz.mjs` (with `tools/titles.mjs`, which reads track titles and dates).
- `js/shows.js`: every show from the DMB Almanac, its date, place and setlist, made by `tools/almanac.mjs` (with `tools/places.mjs`, which tells a venue from its town).
- `js/model.js`: turns the data into songs, nights and versions, with each song's typical lengths and how it changed. `js/almanac.js`: joins every show to those songs and nights, with each song's plays, first and last show, and longest time away. `js/lineup.js`: who was in the band when.
- `js/builder.js`: writes a show: the pool of versions, picking songs, landing on the time, the order, and share links.
- `js/insights.js`: the songs that came before their album, each year's numbers, and which songs lead into which. `js/insight-pages.js`: the pages for those, and the years chart.
- `js/chart.js`: a song's timeline with the lineup underneath, and the small one in the song list. `js/app.js`: the other pages. `js/ui.js`: bits of markup they share.
- `fonts/`: Archivo (SIL Open Font License) and Permanent Marker (Apache License 2.0), served from here so nothing loads from elsewhere.
- `sw.js`: keeps a copy for using offline.
- `test/titles.test.mjs` checks the title and date reading on real titles from the releases; `test/builder.test.mjs` checks known nights, that shows land within a minute for every length and choice with no song twice, that several times or venues mean a night in any of them, and that share links round-trip; `test/almanac.test.mjs` checks reading a setlist, telling a venue from its town, and joining the shows to the songs and released nights; `test/insights.test.mjs` checks the songs before their album, the pairs and runs, and the years; `test/chart.test.mjs` checks how a song's chart is described in words, and that every version lands inside the charts, next year's too; `test/e2e.mjs` builds, edits, keeps and reopens a show, opens a song and a night, follows songs through Before the album and What leads where, steps through the years, opens a song only the Almanac has and a night nothing was released from, and checks it works offline.
