import { useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Dimensions, NativeSyntheticEvent, NativeScrollEvent } from "react-native";
import { useRouter } from "expo-router";
import { Button } from "@/components/Button";
import { PixelDog, PixelCat, SnakeAndTree } from "@/components/PixelArt";
import { markOnboarded } from "@/lib/onboarding";
import { color, font, space } from "@/theme/tokens";

const { width } = Dimensions.get("window");

const SLIDES = [
  {
    title: "Never miss a dose",
    body: "Set up a medication once, and Dosed reminds you when it is time, for every pet you look after.",
    art: <PixelDog pixelSize={10} />,
  },
  {
    title: "One place for every pet",
    body: "Track names, weights, and schedules for as many pets as you have. Everything stays organized by pet.",
    art: <PixelCat pixelSize={10} />,
  },
  {
    title: "Your data, on your devices",
    body: "Create a free account so your pets and dose history sync safely across your phone and any other device you use.",
    art: <SnakeAndTree pixelSize={8} />,
  },
];

export default function Onboarding() {
  const router = useRouter();
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== index) setIndex(next);
  };

  const finish = async () => {
    await markOnboarded();
    router.replace("/auth/register");
  };

  const next = () => {
    if (index < SLIDES.length - 1) {
      scrollRef.current?.scrollTo({ x: width * (index + 1), animated: true });
    } else {
      finish();
    }
  };

  return (
    <View style={styles.wrap}>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={onScroll}
        style={{ flex: 1 }}
      >
        {SLIDES.map((slide, i) => (
          <View key={i} style={[styles.slide, { width }]}>
            <View style={styles.artWrap}>{slide.art}</View>
            <Text style={styles.title}>{slide.title}</Text>
            <Text style={styles.body}>{slide.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={styles.footer}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === index && styles.dotActive]} />
          ))}
        </View>
        <Button label={index === SLIDES.length - 1 ? "Get started" : "Next"} onPress={next} />
        <Text style={styles.skip} onPress={finish}>
          Skip
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: color.paper },
  slide: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
  artWrap: { marginBottom: space.xl, alignItems: "center", justifyContent: "center", minHeight: 140 },
  title: { fontFamily: font.heading, fontSize: 26, color: color.ink, textAlign: "center", marginBottom: space.sm },
  body: { fontFamily: font.body, fontSize: 15, color: color.inkFaint, textAlign: "center", lineHeight: 22 },
  footer: { paddingHorizontal: space.xl, paddingBottom: space.xl, paddingTop: space.md },
  dots: { flexDirection: "row", justifyContent: "center", gap: space.xs, marginBottom: space.lg },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: color.hairline },
  dotActive: { backgroundColor: color.clay, width: 20 },
  skip: {
    fontFamily: font.body, fontSize: 14, color: color.inkFaint, textAlign: "center",
    marginTop: space.md,
  },
});