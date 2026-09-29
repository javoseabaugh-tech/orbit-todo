// Where the well sits in the Water photos (well-day.jpg and well-night.jpg,
// which line up pixel for pixel), and where that lands on screen.
//
// Measured on the shipped 1152×2064 JPEGs: the opening (the inner edge of the
// stones, where the water meets them when the well is full) is centred at
// (576, 770) with radius 278; the outer edge of the stone rim is centred at
// (575, 770) with radius 459. x and radii are shares of the photo's width, y a
// share of its height.
import dayUrl from "./well-day.jpg";
import nightUrl from "./well-night.jpg";
import { prefersDarkDial } from "../../dial/tokens";

export const photoUrl = prefersDarkDial ? nightUrl : dayUrl;
export const PHOTO_ASPECT = 1152 / 2064; // width / height of the shipped JPEGs

export const WELL = { x: 0.5, y: 0.37306, r: 0.24132, rimX: 0.49935, rimY: 0.37318, rimR: 0.39844 };

// The rim, in well radii from the opening's centre (y up), for the shader.
export const RIM_OFFSET = [
  (WELL.rimX - WELL.x) / WELL.r,
  -((WELL.rimY - WELL.y) / PHOTO_ASPECT) / WELL.r,
];
export const RIM_OUTER = WELL.rimR / WELL.r;

// The photo fills the screen's height and is centred. On a phone that is a
// cover fit (the sides are cropped a little); on a wider screen the shader
// mirrors the photo's edges outward, so the well never outgrows the screen.
// All values in CSS pixels from the top-left of the viewport.
export function wellLayout(W, H) {
  const dh = H, dw = H * PHOTO_ASPECT, ox = (W - dw) / 2;
  return {
    ox, dw, dh,
    cx: ox + WELL.x * dw,
    cy: WELL.y * dh,
    r: WELL.r * dw,
    bottom: WELL.rimY * dh + WELL.rimR * dw, // lowest point of the rim
  };
}
