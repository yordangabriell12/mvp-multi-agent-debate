export function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[75%] bg-sand-800 text-white px-4 py-2.5 rounded-2xl rounded-br-md text-sm leading-relaxed">
        {content}
      </div>
    </div>
  )
}