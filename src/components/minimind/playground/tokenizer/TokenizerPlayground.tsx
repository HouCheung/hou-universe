"use client";

import { useCallback, useRef, useState } from "react";
import { MiniTokenizer } from "@/lib/minimind/tokenizer";
import type { ExplainResult } from "@/lib/minimind/tokenizer";
import { InputPanel } from "./InputPanel";
import { PipelinePanel } from "./PipelinePanel";
import { TokenList } from "./TokenList";
import { EncodedPanel } from "./EncodedPanel";
import { DecodedPanel } from "./DecodedPanel";

const DEFAULT_TEXT = "Hello HOU Universe";

/**
 * Create a shared MiniTokenizer instance with demo vocabulary pre-registered.
 *
 * Vocabulary layout:
 *   0 → <pad>     (built-in special)
 *   1 → <unk>     (built-in special)
 *   2 → <bos>     (built-in special)
 *   3 → <eos>     (built-in special)
 *   4 → Hello     (demo)
 *   5 → HOU       (demo)
 *
 * "Universe" is intentionally not registered — it will be <unk> (id=1),
 * demonstrating the unknown token pathway.
 */
function createTokenizer(): MiniTokenizer {
  const tokenizer = new MiniTokenizer();
  tokenizer.addToken("Hello");
  tokenizer.addToken("HOU");
  return tokenizer;
}

export function TokenizerPlayground() {
  const tokenizer = useRef<MiniTokenizer>(createTokenizer()).current;
  const [text, setText] = useState(DEFAULT_TEXT);
  const [result, setResult] = useState<ExplainResult>(() =>
    tokenizer.explain(DEFAULT_TEXT)
  );
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  const handleTextChange = useCallback(
    (newText: string) => {
      setText(newText);
      const trimmed = newText.trim();
      if (trimmed.length === 0) {
        setResult({
          originalText: newText,
          tokens: [],
          unknownTokens: [],
          encoded: [],
          decoded: "",
        });
      } else {
        setResult(tokenizer.explain(newText));
      }
      setSelectedIndex(null);
    },
    [tokenizer]
  );

  const handleSelectToken = useCallback(
    (index: number) => {
      setSelectedIndex((prev) => (prev === index ? null : index));
    },
    []
  );

  const showResults = result.tokens.length > 0;

  return (
    <div className="space-y-5">
      {/* ① Input */}
      <InputPanel value={text} onChange={handleTextChange} />

      {/* ② Pipeline (always visible — static) */}
      <PipelinePanel />

      {showResults && (
        <>
          {/* ③ Tokens */}
          <TokenList
            tokens={result.tokens}
            selectedIndex={selectedIndex}
            onSelect={handleSelectToken}
          />

          {/* ④ Encoded IDs + ⑤ Unknown Tokens */}
          <EncodedPanel
            encoded={result.encoded}
            unknownTokens={result.unknownTokens}
          />

          {/* ⑥ Decoded */}
          <DecodedPanel
            decoded={result.decoded}
            originalText={result.originalText}
          />
        </>
      )}
    </div>
  );
}
