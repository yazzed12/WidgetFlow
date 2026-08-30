import type { TemplateSection, BuilderValidationIssue } from '../../types';
import { BuilderSection } from './BuilderSection';
import { Plus } from 'lucide-react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useDroppable } from '@dnd-kit/core';

interface BuilderCanvasProps {
  sections: TemplateSection[];
  selectedComponentId: string | null;
  componentIssuesMap?: Map<string, BuilderValidationIssue>;
  onSelectComponent: (id: string) => void;
  onDuplicateComponent: (id: string) => void;
  onDeleteComponent: (id: string) => void;
  onRenameSection: (sectionId: string, newTitle: string) => void;
  onDeleteSection: (sectionId: string) => void;
  onAddSection: () => void;
  onAddComponentToSection: (sectionId: string) => void;
  onSaveAsContentPack?: (section: TemplateSection) => void;
  onCanvasClick: () => void;
  isApproved: boolean;
}

export const BuilderCanvas: React.FC<BuilderCanvasProps> = ({
  sections,
  selectedComponentId,
  componentIssuesMap,
  onSelectComponent,
  onDuplicateComponent,
  onDeleteComponent,
  onRenameSection,
  onDeleteSection,
  onAddSection,
  onAddComponentToSection,
  onSaveAsContentPack,
  onCanvasClick,
  isApproved,
}) => {
  const { setNodeRef: setCanvasDropRef, isOver } = useDroppable({
    id: 'builder-canvas-droppable',
    data: { isCanvasDropZone: true },
  });

  const sectionIds = sections.map((s) => s.id);

  return (
    <main
      onClick={onCanvasClick}
      className="flex-1 bg-slate-100/70 p-6 overflow-y-auto min-h-0 space-y-6"
    >
      <div
        ref={setCanvasDropRef}
        className={`max-w-4xl mx-auto space-y-6 min-h-[500px] p-2 transition-all ${
          isOver ? 'ring-2 ring-indigo-500/30 rounded-2xl bg-indigo-50/10' : ''
        }`}
      >
        <SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
          {sections.map((sec) => (
            <BuilderSection
              key={sec.id}
              section={sec}
              totalSections={sections.length}
              selectedComponentId={selectedComponentId}
              componentIssuesMap={componentIssuesMap}
              onSelectComponent={onSelectComponent}
              onDuplicateComponent={onDuplicateComponent}
              onDeleteComponent={onDeleteComponent}
              onRenameSection={onRenameSection}
              onDeleteSection={onDeleteSection}
              onAddComponentToSection={onAddComponentToSection}
              onSaveAsContentPack={onSaveAsContentPack}
              isApproved={isApproved}
            />
          ))}
        </SortableContext>

        {/* Add Section Button */}
        {!isApproved && (
          <div className="pt-2 flex justify-center">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onAddSection();
              }}
              className="px-5 py-2.5 bg-white hover:bg-slate-50 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 shadow-2xs hover:shadow-xs transition-all flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-indigo-600" />
              <span>Add New Section</span>
            </button>
          </div>
        )}
      </div>
    </main>
  );
};
