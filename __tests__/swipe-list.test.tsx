import { act, renderHook } from "@testing-library/react-native";

import { useSwipeList } from "@/components/SwipeToDelete";

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
