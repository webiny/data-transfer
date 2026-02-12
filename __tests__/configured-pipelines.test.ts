import { describe, it, expect } from "vitest";
import {
  CmsModelPipeline,
  CmsEntryPipeline,
  FmSettingsPipeline,
  FmFilePipeline,
  FolderPermissionsPipeline,
  SecurityGroupPipeline,
  SecurityTeamPipeline,
  MailerSettingsPipeline
} from "../src/pipelines";

describe("Pre-configured Pipelines", () => {
  describe("CmsModelPipeline", () => {
    it("should accept cms.model records", () => {
      const pipeline = new CmsModelPipeline().build();
      const record = { TYPE: "cms.model", modelId: "test" };

      expect(pipeline.accepts(record)).toBe(true);
    });

    it("should reject non-cms.model records", () => {
      const pipeline = new CmsModelPipeline().build();
      const record = { TYPE: "cms.entry", modelId: "test" };

      expect(pipeline.accepts(record)).toBe(false);
    });

    it("should allow adding custom filters", () => {
      const pipeline = new CmsModelPipeline()
        .filter(record => record.modelId === "blogPost")
        .build();

      expect(pipeline.accepts({ TYPE: "cms.model", modelId: "blogPost" })).toBe(true);
      expect(pipeline.accepts({ TYPE: "cms.model", modelId: "page" })).toBe(false);
    });
  });

  describe("CmsEntryPipeline", () => {
    it("should accept cms.entry records", () => {
      const pipeline = new CmsEntryPipeline().build();
      const record = { TYPE: "cms.entry", modelId: "blogPost" };

      expect(pipeline.accepts(record)).toBe(true);
    });

    it("should accept cms.entry.l records", () => {
      const pipeline = new CmsEntryPipeline().build();
      const record = { TYPE: "cms.entry.l", modelId: "blogPost" };

      expect(pipeline.accepts(record)).toBe(true);
    });

    it("should accept fmFile records (but FmFilePipeline should catch them first)", () => {
      const pipeline = new CmsEntryPipeline().build();

      // CmsEntryPipeline now accepts fmFile records
      // In practice, FmFilePipeline catches them first due to registration order
      expect(pipeline.accepts({ TYPE: "cms.entry", modelId: "fmFile" })).toBe(true);
      expect(pipeline.accepts({ TYPE: "cms.entry", modelId: "wbyFmFile" })).toBe(true);
    });

    it("should allow adding custom filters", () => {
      const pipeline = new CmsEntryPipeline()
        .filter(record => record.status === "published")
        .build();

      expect(
        pipeline.accepts({ TYPE: "cms.entry", modelId: "blogPost", status: "published" })
      ).toBe(true);
      expect(pipeline.accepts({ TYPE: "cms.entry", modelId: "blogPost", status: "draft" })).toBe(
        false
      );
    });
  });

  describe("FmSettingsPipeline", () => {
    it("should accept fm.settings records", () => {
      const pipeline = new FmSettingsPipeline().build();
      const record = { TYPE: "fm.settings" };

      expect(pipeline.accepts(record)).toBe(true);
    });

    it("should reject non-fm.settings records", () => {
      const pipeline = new FmSettingsPipeline().build();
      const record = { TYPE: "cms.model" };

      expect(pipeline.accepts(record)).toBe(false);
    });
  });

  describe("FmFilePipeline", () => {
    it("should accept fmFile records", () => {
      const pipeline = new FmFilePipeline().build();
      const record = { modelId: "fmFile", TYPE: "cms.entry" };

      expect(pipeline.accepts(record)).toBe(true);
    });

    it("should accept wbyFmFile records", () => {
      const pipeline = new FmFilePipeline().build();
      const record = { modelId: "wbyFmFile", TYPE: "cms.entry" };

      expect(pipeline.accepts(record)).toBe(true);
    });

    it("should reject non-file records", () => {
      const pipeline = new FmFilePipeline().build();
      const record = { modelId: "blogPost", TYPE: "cms.entry" };

      expect(pipeline.accepts(record)).toBe(false);
    });

    it("should allow adding custom filters", () => {
      const pipeline = new FmFilePipeline()
        .filter(record => (record.size as number) < 1000000) // < 1MB
        .build();

      expect(pipeline.accepts({ modelId: "fmFile", TYPE: "cms.entry", size: 500000 })).toBe(true);
      expect(pipeline.accepts({ modelId: "fmFile", TYPE: "cms.entry", size: 2000000 })).toBe(false);
    });
  });

  describe("FolderPipeline", () => {
    it("should accept FLP records", () => {
      const pipeline = new FolderPermissionsPipeline().build();
      const record = { PK: "T#root#L#en-US#FLP#folder1", SK: "A" };

      expect(pipeline.accepts(record)).toBe(true);
    });

    it("should reject non-FLP records", () => {
      const pipeline = new FolderPermissionsPipeline().build();
      const record = { PK: "T#root#L#en-US#CME#entry1", SK: "A" };

      expect(pipeline.accepts(record)).toBe(false);
    });
  });

  describe("SecurityGroupPipeline", () => {
    it("should accept security.group records", () => {
      const pipeline = new SecurityGroupPipeline().build();
      const record = { TYPE: "security.group", slug: "content-editor" };

      expect(pipeline.accepts(record)).toBe(true);
    });

    it("should reject full-access group", () => {
      const pipeline = new SecurityGroupPipeline().build();
      const record = { TYPE: "security.group", slug: "full-access" };

      expect(pipeline.accepts(record)).toBe(false);
    });

    it("should reject anonymous group", () => {
      const pipeline = new SecurityGroupPipeline().build();
      const record = { TYPE: "security.group", slug: "anonymous" };

      expect(pipeline.accepts(record)).toBe(false);
    });

    it("should check GSI1_SK if slug is not present", () => {
      const pipeline = new SecurityGroupPipeline().build();

      expect(pipeline.accepts({ TYPE: "security.group", GSI1_SK: "full-access" })).toBe(false);
      expect(pipeline.accepts({ TYPE: "security.group", GSI1_SK: "content-editor" })).toBe(true);
    });
  });

  describe("SecurityTeamPipeline", () => {
    it("should accept security.team records", () => {
      const pipeline = new SecurityTeamPipeline().build();
      const record = { TYPE: "security.team", name: "Marketing" };

      expect(pipeline.accepts(record)).toBe(true);
    });

    it("should reject non-security.team records", () => {
      const pipeline = new SecurityTeamPipeline().build();
      const record = { TYPE: "security.group" };

      expect(pipeline.accepts(record)).toBe(false);
    });
  });

  describe("MailerSettingsPipeline", () => {
    it("should accept mailerSettings records", () => {
      const pipeline = new MailerSettingsPipeline().build();
      const record = { SK: "L", modelId: "mailerSettings" };

      expect(pipeline.accepts(record)).toBe(true);
    });

    it("should reject non-mailerSettings records", () => {
      const pipeline = new MailerSettingsPipeline().build();

      expect(pipeline.accepts({ SK: "L", modelId: "other" })).toBe(false);
      expect(pipeline.accepts({ SK: "A", modelId: "mailerSettings" })).toBe(false);
    });
  });

  describe("Custom Transformers", () => {
    it("should allow adding custom transformers to pipelines", () => {
      const customTransformer = {
        name: "customTransformer",
        transform: async (ctx: any) => {
          ctx.record.customField = "custom value";
        }
      };

      const pipeline = new CmsModelPipeline().use(customTransformer).build();

      // Should not throw
      expect(pipeline).toBeDefined();
    });
  });
});
