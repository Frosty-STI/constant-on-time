import module00 from '../../../packages/lesson-content/modules/module-00.json';
import module01 from '../../../packages/lesson-content/modules/module-01.json';
import module02 from '../../../packages/lesson-content/modules/module-02.json';
import module03 from '../../../packages/lesson-content/modules/module-03.json';
import module04 from '../../../packages/lesson-content/modules/module-04.json';
import module05 from '../../../packages/lesson-content/modules/module-05.json';
import module06 from '../../../packages/lesson-content/modules/module-06.json';
import module07 from '../../../packages/lesson-content/modules/module-07.json';
import module08 from '../../../packages/lesson-content/modules/module-08.json';
import module09 from '../../../packages/lesson-content/modules/module-09.json';
import module10 from '../../../packages/lesson-content/modules/module-10.json';
import module11 from '../../../packages/lesson-content/modules/module-11.json';
import module12 from '../../../packages/lesson-content/modules/module-12.json';

export interface CurriculumLesson {
  readonly id: string;
  readonly title: string;
  readonly concepts: readonly string[];
  readonly physicalIntuition: string;
  readonly mathematicalDerivation: string;
  readonly modelingConsequence: string;
  readonly assumptions: readonly string[];
  readonly citations: readonly string[];
  readonly evidenceLabels: readonly string[];
  readonly interaction: string;
  readonly transferQuestion: string;
}

export interface CurriculumModule {
  readonly id: string;
  readonly number: number;
  readonly title: string;
  readonly prerequisites: readonly string[];
  readonly lessons: readonly CurriculumLesson[];
}

export const CURRICULUM_MODULES = [
  module00, module01, module02, module03, module04, module05, module06,
  module07, module08, module09, module10, module11, module12,
] as readonly CurriculumModule[];

export const LESSON_COUNT = CURRICULUM_MODULES.reduce((count, module) => count + module.lessons.length, 0);
