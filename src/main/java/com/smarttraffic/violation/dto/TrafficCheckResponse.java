package com.smarttraffic.violation.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class TrafficCheckResponse {

    private boolean violationDetected;
    private String message;
    private Integer fine;
    private ViolationResponse violation;
}
