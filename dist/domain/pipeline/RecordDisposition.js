export var RecordDisposition;
(function (RecordDisposition) {
  class Processed {}
  RecordDisposition.Processed = Processed;
  class Blackholed {
    pipelineName;
    constructor(pipelineName) {
      this.pipelineName = pipelineName;
    }
  }
  RecordDisposition.Blackholed = Blackholed;
  class Unmatched {}
  RecordDisposition.Unmatched = Unmatched;
})(RecordDisposition || (RecordDisposition = {}));
//# sourceMappingURL=RecordDisposition.js.map
