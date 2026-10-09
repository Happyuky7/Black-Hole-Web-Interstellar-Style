// The soundtrack element, shared by the start screen and the player. Kept in
// its own tiny module so the start screen can start it *inside* the click
// handler: Safari, iOS and some Firefox setups only allow audio with sound
// while a user gesture is being handled, and the 3D engine takes a moment to
// download after the click.
export const MUSIC_URL = `${import.meta.env.BASE_URL}audio/interstellar-main-theme.mp3`;

export const music = new Audio(MUSIC_URL);
music.loop = true;
music.preload = 'none'; // don't download 8 MB unless someone actually wants music

/** Start playback silently during a user gesture; the player fades it in later. */
export function unlockMusic(){
  music.volume = 0;
  const p = music.play();
  if(p) p.catch(() => {}); // a later retry is handled by the player
}
