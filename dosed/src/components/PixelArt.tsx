import { View, Text, StyleSheet } from "react-native";
import { color, font } from "@/theme/tokens";

// Deliberately built from a grid of plain Views rather than an image asset
// or an SVG library: no new native dependency (so no 20-minute EAS rebuild
// to add it), no bundled image to ship, and the blocky look is the point.
type Grid = number[][]; // 0 = transparent, any other number = a palette key
type Palette = Record<number, string>;

export function PixelArt({
  grid,
  palette,
  pixelSize = 5,
}: {
  grid: Grid;
  palette: Palette;
  pixelSize?: number;
}) {
  return (
    <View pointerEvents="none">
      {grid.map((row, y) => (
        <View key={y} style={{ flexDirection: "row" }}>
          {row.map((cell, x) => (
            <View
              key={x}
              style={{
                width: pixelSize,
                height: pixelSize,
                backgroundColor: cell === 0 ? "transparent" : palette[cell],
              }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

// A small snake wrapped around a tree trunk, sitting under a leafy canopy.
// Purely decorative — used at the top of a couple of screens for warmth.
export const SNAKE_TREE_GRID: Grid = [
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,3,2,3,3,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,3,2,3,3,2,3,0,0,0,0,0,0],
  [0,0,0,0,0,3,2,3,3,3,3,2,3,0,0,0,0,0],
  [0,0,0,0,0,3,3,3,3,2,3,3,3,0,0,0,0,0],
  [0,0,0,0,3,2,3,3,3,3,3,3,2,3,0,0,0,0],
  [0,0,0,0,2,3,3,3,3,3,3,6,3,2,0,0,0,0],
  [0,0,0,0,0,3,2,3,3,3,4,4,5,0,0,0,0,0],
  [0,0,0,0,0,3,3,4,3,3,2,3,3,0,0,0,0,0],
  [0,0,0,0,0,0,3,3,3,3,4,3,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,1,5,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,4,1,1,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,4,1,1,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,1,5,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,1,4,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,4,1,1,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,5,1,1,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,1,4,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,1,4,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,5,1,1,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,1,1,0,0,0,0,0,0,0,0],
];

export const SNAKE_TREE_PALETTE: Palette = {
  1: color.clayDeep,  // trunk
  2: color.moss,      // leaf shadow
  3: color.mossFaint, // leaf light
  4: color.clay,      // snake body
  5: color.amber,     // snake belly highlight
  6: color.ink,        // eye
};

export const PIXEL_DOG_GRID: Grid = [
  [0,0,0,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,1,1,1,1,0,0,0,0,0,0,0,0],
  [0,0,1,2,1,1,1,0,0,0,0,0,0,0],
  [0,0,1,1,1,1,1,1,0,0,0,0,0,0],
  [0,0,4,1,1,4,1,1,0,0,0,0,0,0],
  [0,0,1,1,1,1,1,1,1,0,0,0,0,0],
  [0,0,1,1,4,1,1,1,1,0,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,1,0,0,0,0],
  [0,1,3,3,1,3,3,1,3,1,0,0,0,0],
  [0,1,3,3,1,3,3,1,3,1,0,0,0,0],
  [0,1,1,0,1,1,0,1,1,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

export const PIXEL_CAT_GRID: Grid = [
  [0,0,1,0,0,0,0,1,0,0,0,0,0,0],
  [0,1,1,1,0,0,1,1,1,0,0,0,0,0],
  [0,1,1,1,1,1,1,1,1,0,0,0,0,0],
  [0,1,4,1,1,1,1,4,1,0,0,0,0,0],
  [0,1,1,1,2,2,1,1,1,0,0,0,0,0],
  [0,0,1,1,1,1,1,1,0,0,0,0,0,0],
  [0,0,1,1,1,1,1,1,0,1,0,0,0,0],
  [0,0,1,1,1,1,1,1,1,1,0,0,0,0],
  [0,0,1,1,3,3,1,1,1,0,0,0,0,0],
  [0,0,1,1,3,3,1,1,0,0,0,0,0,0],
  [0,0,1,0,1,1,0,1,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

export const PET_PALETTE: Palette = {
  1: color.clay,
  2: color.clayDeep,
  3: color.paperRaised,
  4: color.ink,
};

export const CAT_PALETTE: Palette = {
  1: color.moss,
  2: "#33492F",
  3: color.paperRaised,
  4: color.ink,
};

// A sloth hanging by one arm from a branch — used by the generic "nothing
// here yet" placeholder (src/components/NothingHere.tsx), for spots in the
// app that are intentionally empty rather than broken.
export const PIXEL_SLOTH_GRID: Grid = [
  [0,0,0,0,3,3,3,3,3,3,3,3,3,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0],
  [0,0,0,1,1,2,2,1,1,0,0,0,0,0,0,0],
  [0,0,0,1,2,4,2,4,1,0,0,0,0,0,0,0],
  [0,0,0,1,2,2,2,2,1,0,0,0,0,0,0,0],
  [0,0,0,0,1,5,5,1,0,0,0,0,0,0,0,0],
  [0,0,1,1,1,5,5,1,1,1,0,0,0,0,0,0],
  [0,1,1,1,1,5,5,1,1,1,1,0,0,0,0,0],
  [0,1,1,0,1,5,5,1,0,1,1,0,0,0,0,0],
  [0,4,1,0,1,1,1,1,0,1,4,0,0,0,0,0],
  [0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,1,1,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,1,1,1,1,0,0,0,0,0,0,0,0],
  [0,0,0,0,4,4,4,4,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
  [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
];

export const SLOTH_PALETTE: Palette = {
  1: color.amber,
  2: color.clayDeep,
  3: color.clayDeep,
  4: color.ink,
  5: color.paperRaised,
};

export function PixelSloth({ pixelSize = 5 }: { pixelSize?: number }) {
  return <PixelArt grid={PIXEL_SLOTH_GRID} palette={SLOTH_PALETTE} pixelSize={pixelSize} />;
}

export function SnakeAndTree({ pixelSize = 5 }: { pixelSize?: number }) {
  return <PixelArt grid={SNAKE_TREE_GRID} palette={SNAKE_TREE_PALETTE} pixelSize={pixelSize} />;
}

// A small round portrait for a pet, used anywhere a pet needs to be picked
// out of a list at a glance (the Today strip, section headers). Dogs and
// cats get their pixel sprite shrunk into a tile of their own color; any
// other species (or one we don't have art for) falls back to an initial
// letter on a tinted disc rather than a generic paw icon, so it still reads
// as "this specific pet" instead of "an animal."
const SPECIES_TILE: Record<string, { bg: string; render: () => JSX.Element }> = {
  dog: { bg: "#EFE2D6", render: () => <PixelDog pixelSize={2} /> },
  cat: { bg: color.mossFaint, render: () => <PixelCat pixelSize={2} /> },
};

export function PetAvatar({ name, species, size = 44 }: { name: string; species: string; size?: number }) {
  const tile = SPECIES_TILE[species?.toLowerCase?.() ?? ""];
  return (
    <View style={[avatarStyles.wrap, { width: size, height: size, borderRadius: size / 2, backgroundColor: tile?.bg ?? color.clay }]}>
      {tile ? tile.render() : (
        <Text style={[avatarStyles.initial, { fontSize: size * 0.4 }]}>{name.trim().charAt(0).toUpperCase() || "?"}</Text>
      )}
    </View>
  );
}

const avatarStyles = StyleSheet.create({
  wrap: { alignItems: "center", justifyContent: "center", overflow: "hidden" },
  initial: { fontFamily: font.heading, color: color.paper },
});

export function PixelDog({ pixelSize = 5 }: { pixelSize?: number }) {
  return <PixelArt grid={PIXEL_DOG_GRID} palette={PET_PALETTE} pixelSize={pixelSize} />;
}

export function PixelCat({ pixelSize = 5 }: { pixelSize?: number }) {
  return <PixelArt grid={PIXEL_CAT_GRID} palette={CAT_PALETTE} pixelSize={pixelSize} />;
}
