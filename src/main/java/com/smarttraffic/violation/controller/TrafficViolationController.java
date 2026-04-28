package com.smarttraffic.violation.controller;

import com.smarttraffic.violation.dto.StatsResponse;
import com.smarttraffic.violation.dto.TrafficCheckRequest;
import com.smarttraffic.violation.dto.TrafficCheckResponse;
import com.smarttraffic.violation.dto.ViolationResponse;
import com.smarttraffic.violation.dto.ViolationUpdateRequest;
import com.smarttraffic.violation.service.ViolationService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/traffic")
@RequiredArgsConstructor
@Validated
public class TrafficViolationController {

    private final ViolationService violationService;

    @PostMapping("/check")
    public ResponseEntity<TrafficCheckResponse> checkTraffic(@Valid @RequestBody TrafficCheckRequest request) {
        return ResponseEntity.status(HttpStatus.CREATED).body(violationService.checkTrafficViolation(request));
    }

    @GetMapping("/all")
    public ResponseEntity<Page<ViolationResponse>> getAllViolations(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "5") int size,
            @RequestParam(defaultValue = "createdAt") String sortBy,
            @RequestParam(defaultValue = "desc") String order) {
        return ResponseEntity.ok(violationService.getAllViolations(page, size, sortBy, order));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ViolationResponse> getViolationById(@PathVariable Long id) {
        return ResponseEntity.ok(violationService.getViolationById(id));
    }

    @PutMapping("/{id}")
    public ResponseEntity<ViolationResponse> updateViolation(@PathVariable Long id,
                                                             @Valid @RequestBody ViolationUpdateRequest request) {
        return ResponseEntity.ok(violationService.updateViolation(id, request));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteViolation(@PathVariable Long id) {
        violationService.deleteViolation(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/filter")
    public ResponseEntity<Page<ViolationResponse>> filterViolations(
            @RequestParam(required = false) String zone,
            @RequestParam(required = false) Integer minSpeed,
            @RequestParam(required = false) Integer maxSpeed,
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "5") int size,
            @RequestParam(defaultValue = "createdAt") String sortBy,
            @RequestParam(defaultValue = "desc") String order) {
        return ResponseEntity.ok(
                violationService.filterViolations(zone, minSpeed, maxSpeed, page, size, sortBy, order)
        );
    }

    @GetMapping("/stats")
    public ResponseEntity<StatsResponse> getStats() {
        return ResponseEntity.ok(violationService.getViolationStats());
    }
}
