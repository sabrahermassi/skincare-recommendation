import { useState, type Ref } from "react";
import { ScrollView, type ScrollViewProps } from "react-native";

/**
 * How far the content may run past the screen and still count as fitting. A
 * screen whose last few points of bottom padding fall off the edge has nothing
 * to scroll to, and letting it move by those few points reads as a glitch.
 */
const FIT_TOLERANCE = 16;

/**
 * A screen's scroll view that only scrolls when there is something to scroll
 * to (owner, 2 October 2026): when the content fits it holds still, with no
 * bounce, and when it doesn't (a longer list, a smaller phone, larger text,
 * the keyboard up) it scrolls as usual. A horizontal one is left alone.
 */
export function FitScrollView({ ref, scrollEnabled = true, onLayout, onContentSizeChange, ...rest }: ScrollViewProps & { ref?: Ref<ScrollView> }) {
  const [viewport, setViewport] = useState(0);
  const [content, setContent] = useState(0);
  if (rest.horizontal) return <ScrollView ref={ref} scrollEnabled={scrollEnabled} onLayout={onLayout} onContentSizeChange={onContentSizeChange} {...rest} />;
  return (
    <ScrollView
      ref={ref}
      alwaysBounceVertical={false}
      overScrollMode="never"
      {...rest}
      scrollEnabled={scrollEnabled && content > viewport + FIT_TOLERANCE}
      onLayout={(event) => {
        setViewport(event.nativeEvent.layout.height);
        onLayout?.(event);
      }}
      onContentSizeChange={(width, height) => {
        setContent(height);
        onContentSizeChange?.(width, height);
      }}
    />
  );
}
