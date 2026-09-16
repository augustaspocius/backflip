import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"

/**
 * Card and lesson markdown. `react-markdown` does not render raw HTML unless
 * `rehype-raw` is added, so teacher input cannot inject markup — do not add
 * that plugin without an sanitizer.
 *
 * @spec L2-COURSE-07
 */
export function Markdown({ source }: { source: string }) {
  return (
    <div className="prose prose-sm dark:prose-invert max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{source}</ReactMarkdown>
    </div>
  )
}
