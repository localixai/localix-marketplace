import type { CSSProperties } from 'react'

/**
 * The celebration for a win the person made in front of them: pieces fall once from above the
 * board (`board.css`). Each piece's place, drift, spin and wait are written as custom properties
 * from its index, never from `Math.random()`: a render stays pure, and a test sees the same
 * confetti every time. The colours come from the stylesheet (host chart tokens).
 */
const PIECES = Array.from({ length: 28 }, (_, index) => ({
  x: `${((index * 37) % 100) + 1}%`,
  drift: `${((index * 53) % 9) * 14 - 56}px`,
  spin: `${360 + ((index * 71) % 5) * 90}deg`,
  wait: `${(index % 7) * 70}ms`,
}))

export function Confetti() {
  return (
    <div aria-hidden="true" className="example-game-confetti">
      {PIECES.map((piece, index) => (
        <i
          key={index}
          style={
            {
              '--example-game-x': piece.x,
              '--example-game-drift': piece.drift,
              '--example-game-spin': piece.spin,
              '--example-game-wait': piece.wait,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
