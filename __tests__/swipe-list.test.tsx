import { act, fireEvent, render, renderHook, screen } from "@testing-library/react-native";
import { Text } from "react-native";

import { SwipeListScope, SwipeToDelete, useSwipeList } from "@/components/SwipeToDelete";

let mockReduceMotion = false;
jest.mock("@/lib/reduce-motion", () => ({ reduceMotionNow: () => mockReduceMotion }));

/**
 * A list of swipe-to-delete cards (History, starred ingredients): the list
 * holds still while a card is swiped, so a slightly diagonal swipe doesn't
 * drag the page up and down (owner), and only one card is open at a time.
 */

it("stops the list scrolling for the length of a swipe", async () => {
  const { result } = await renderHook(() => useSwipeList());
  const close = jest.fn();
  expect(result.current.scrollEnabled).toBe(true);

  await act(async () => result.current.list.began(close));
  expect(result.current.scrollEnabled).toBe(false);

  await act(async () => result.current.list.rested(close, true));
  expect(result.current.scrollEnabled).toBe(true);
});

it("closes the open card when another starts to swipe, or the list scrolls", async () => {
  const { result } = await renderHook(() => useSwipeList());
  const first = jest.fn();
  const second = jest.fn();

  await act(async () => {
    result.current.list.began(first);
    result.current.list.rested(first, true);
    result.current.list.began(second);
  });
  expect(first).toHaveBeenCalledTimes(1);

  await act(async () => {
    result.current.list.rested(second, true);
    result.current.onScrollBeginDrag();
  });
  expect(second).toHaveBeenCalledTimes(1);
});

// With Reduce Motion on, a card still tells its list it has come to rest, or
// the list would stay unable to scroll.
it.each([false, true])("tells the list a card has come to rest (Reduce Motion %s)", async (reduce: boolean) => {
  mockReduceMotion = reduce;
  const list = { began: jest.fn(), rested: jest.fn(), closeOpen: jest.fn() };
  await render(
    <SwipeListScope list={list}>
      <SwipeToDelete label="Niacinamide" onDelete={jest.fn()}>
        <Text>Niacinamide</Text>
      </SwipeToDelete>
    </SwipeListScope>,
  );
  await act(async () => fireEvent.press(screen.getByRole("button", { name: "Delete Niacinamide" })));
  expect(list.rested).toHaveBeenCalledWith(expect.any(Function), false);
  mockReduceMotion = false;
});
