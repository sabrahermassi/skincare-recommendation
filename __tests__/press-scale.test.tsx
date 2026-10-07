import { act, renderHook } from "@testing-library/react-native";
import { Animated } from "react-native";

import { usePressScale } from "@/components/PressableCard";

import { reduceMotionNow } from "@/lib/reduce-motion";

jest.mock("@/lib/reduce-motion", () => ({ reduceMotionNow: jest.fn(() => false) }));

/** A pressed card sinks and springs back; with Reduce Motion on it stays as it is. */
it("springs a pressed card, and leaves it alone with Reduce Motion on", async () => {
  const spring = jest.spyOn(Animated, "spring");
  const { result } = await renderHook(() => usePressScale());
  await act(async () => result.current[1].onPressIn());
  expect(spring).toHaveBeenCalledTimes(1);
  jest.mocked(reduceMotionNow).mockReturnValue(true);
  await act(async () => result.current[1].onPressIn());
  await act(async () => result.current[1].onPressOut());
  expect(spring).toHaveBeenCalledTimes(1);
  spring.mockRestore();
});
