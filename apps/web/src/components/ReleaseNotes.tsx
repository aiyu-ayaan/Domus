import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

/**
 * Release notes as written on the release: Markdown with headings, lists, links, tables and images.
 * Loaded on demand (see `lib/releases.tsx`), so the parser stays out of the entry chunk.
 */
export default function ReleaseNotes({ markdown }: { markdown: string }) {
  return (
    <div className="flex flex-col gap-3 text-body text-muted [overflow-wrap:anywhere]">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          // The page already has a title: headings in the notes stay below it.
          h1: (p) => <h3 className="text-title font-semibold text-fg" {...p} />,
          h2: (p) => <h3 className="text-title font-semibold text-fg" {...p} />,
          h3: (p) => <h4 className="font-semibold text-fg" {...p} />,
          h4: (p) => <h4 className="font-medium text-fg" {...p} />,
          ul: (p) => <ul className="flex list-disc flex-col gap-1 ps-5" {...p} />,
          ol: (p) => <ol className="flex list-decimal flex-col gap-1 ps-5" {...p} />,
          a: (p) => <a className="text-info underline-offset-2 hover:underline" target="_blank" rel="noreferrer" {...p} />,
          strong: (p) => <strong className="font-semibold text-fg" {...p} />,
          code: (p) => <code className="rounded bg-raised px-1 py-0.5 text-label text-fg" {...p} />,
          pre: (p) => <pre className="overflow-x-auto rounded-md border border-border bg-raised p-3 [&_code]:bg-transparent [&_code]:p-0" {...p} />,
          blockquote: (p) => <blockquote className="border-s-2 border-border-strong ps-3" {...p} />,
          hr: () => <hr className="border-border" />,
          img: (p) => <img className="max-w-full rounded-md border border-border" loading="lazy" {...p} />,
          // Wide tables scroll on their own instead of pushing the page sideways.
          table: (p) => (
            <div className="overflow-x-auto rounded-md border border-border">
              <table className="w-full border-collapse text-start text-label" {...p} />
            </div>
          ),
          th: (p) => <th className="border-b border-border bg-raised px-3 py-2 font-medium text-fg" {...p} />,
          td: (p) => <td className="border-b border-border px-3 py-2 tabular" {...p} />,
        }}
      >
        {markdown}
      </Markdown>
    </div>
  )
}
